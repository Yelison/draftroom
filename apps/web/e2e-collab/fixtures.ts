import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type WebSocketRoute,
} from '@playwright/test'
import { environment } from './environment.ts'
import { people, type DemoPerson } from './people.ts'
import { ServerProcess } from './serverProcess.ts'

/** What the browser reports when the network or the server goes away on purpose: expected in a test that does it. */
const connectionErrors = [/WebSocket connection to .* failed/, /Failed to load resource/, /ERR_INTERNET_DISCONNECTED/]

/** One person in one browser context, signed in with the development identity cookie that the test proxy turns into a header. */
export class Participant {
  private readonly problems: string[] = []
  private tolerated: readonly RegExp[] = []

  constructor(
    readonly person: DemoPerson,
    readonly context: BrowserContext,
    readonly page: Page,
  ) {
    page.on('pageerror', (error) => this.problems.push(`uncaught: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') this.problems.push(`console.error: ${message.text()}`)
    })
  }

  /** The text area of the open document. */
  get editor(): Locator {
    return this.page.getByRole('textbox', { name: 'Document content' })
  }

  /** The live region of the sync status: the one place the state is written as a sentence. */
  get syncStatus(): Locator {
    return this.page.getByRole('status').filter({ hasText: /^Sync status/ })
  }

  /** The avatar the screen shows for a person who is in the document; there is none for someone who is not. */
  presenceOf(name: string): Locator {
    return this.page.getByRole('list', { name: 'People in this document' }).getByRole('img', { name })
  }

  async open(documentId: string): Promise<void> {
    await this.page.goto(`/documents/${documentId}`)
    await this.editor.waitFor()
    await expect(this.syncStatus).toHaveText('Sync status: Synced')
  }

  /** Puts the caret after the last character, as typing at the end of the paragraph does, and types there. */
  async typeAtEnd(text: string, delayMilliseconds = 0): Promise<void> {
    await this.editor.click()
    await this.page.keyboard.press('Control+End')
    await this.page.keyboard.type(text, { delay: delayMilliseconds })
  }

  /** The paragraphs of the document, one per line, without the names that the carets of other people put in the text. */
  async text(): Promise<string> {
    return this.editor.evaluate((root) => {
      const copy = root.cloneNode(true) as HTMLElement
      // The caret of someone else is drawn inside the paragraph, with its own class (`caret`, `caretLabel`).
      for (const caret of copy.querySelectorAll('[class*="_caret"]')) caret.remove()
      return Array.from(copy.querySelectorAll('p'), (paragraph) => paragraph.textContent).join('\n')
    })
  }

  /**
   * Puts the collaboration connections of this page under the control of the test, without changing them: each one is made to
   * the real server, with the page's own `Origin` and cookie (the proxy needs both, so a connection that opens at all proves
   * it), and everything the page says is passed on. While `hold()` is in effect a new connection waits to be made, and
   * `release()` lets it go: the order of two answers that the network leaves open is then the test's.
   *
   * The connections are made from Node, not by the browser, so `context.setOffline` does not reach them. The test says when
   * the server cannot be reached (`setReachable`), and a connection made then fails as it does for a browser that is offline.
   */
  async controlCollaboration(): Promise<{ hold(): void; release(): void; setReachable(reachable: boolean): void }> {
    let reachable = true
    const connected = new Set<WebSocketRoute>()
    let gate: Promise<void> = Promise.resolve()
    let open = () => {}
    await this.page.routeWebSocket(/\/collab$/, async (client) => {
      const said: (string | Buffer)[] = []
      let closed = false
      client.onMessage((message) => said.push(message))
      client.onClose(() => (closed = true))
      await gate
      if (closed) return
      if (!reachable) return client.close()
      const server = client.connectToServer()
      connected.add(client)
      client.onClose(() => connected.delete(client))
      for (const message of said) server.send(message)
      client.onMessage((message) => server.send(message))
    })
    return {
      hold: () => {
        gate = new Promise((resolve) => (open = resolve))
      },
      release: () => open(),
      setReachable: (value) => {
        reachable = value
        // What is connected goes with the network, as it does for a browser that is offline.
        if (!value) for (const client of connected) void client.close()
      },
    }
  }

  /** The offline copies this browser keeps for the signed-in accounts, by database name (`draftroom:<user>:<workspace>:<document>`). */
  async localCopies(): Promise<string[]> {
    return this.page.evaluate(async () =>
      (await indexedDB.databases()).flatMap(({ name }) => (name?.startsWith('draftroom:') ? [name] : [])),
    )
  }

  /** Records every state the sync status announces from now on, in order, for a test to look at afterwards. */
  async recordSyncStates(): Promise<void> {
    await this.syncStatus.evaluate((region) => {
      const seen: string[] = [region.textContent ?? '']
      Object.assign(window, { seenSyncStates: seen })
      new MutationObserver(() => seen.push(region.textContent ?? '')).observe(region, {
        childList: true,
        characterData: true,
        subtree: true,
      })
    })
  }

  async recordedSyncStates(): Promise<string[]> {
    return this.page.evaluate((): string[] => Reflect.get(window, 'seenSyncStates'))
  }

  /** For a test that takes the network or the server away: the errors it causes are the point, not a defect. */
  toleratesConnectionErrors(): void {
    this.tolerated = connectionErrors
  }

  unexpectedProblems(): string[] {
    return this.problems.filter((problem) => !this.tolerated.some((pattern) => pattern.test(problem)))
  }
}

async function join(browser: Browser, person: DemoPerson): Promise<Participant> {
  const context = await browser.newContext({ baseURL: environment.appOrigin, locale: 'en-US', colorScheme: 'light' })
  await context.addCookies([{ name: 'dr_dev_user', value: people[person], url: environment.appOrigin }])
  return new Participant(person, context, await context.newPage())
}

interface Fixtures {
  /** A new browser context of a person; the contexts close with the test, and an error the page reported fails it. */
  join: (person: DemoPerson) => Promise<Participant>
}

interface WorkerFixtures {
  /** The server of the stack, running for the tests of a worker and stopped after them. */
  server: ServerProcess
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  server: [
    // Playwright reads what a fixture needs from the pattern its first argument is destructured with: this needs nothing.
    // oxlint-disable-next-line no-empty-pattern
    async ({}, run) => {
      const server = new ServerProcess()
      await server.start()
      await run(server)
      await server.stop('SIGTERM')
    },
    { scope: 'worker', auto: true },
  ],

  join: async ({ browser }, run) => {
    const joined: Participant[] = []
    await run(async (person) => {
      const participant = await join(browser, person)
      joined.push(participant)
      return participant
    })
    const problems = joined.flatMap((participant) =>
      participant.unexpectedProblems().map((problem) => `${participant.person}: ${problem}`),
    )
    await Promise.all(joined.map(({ context }) => context.close()))
    expect(problems, 'errors the browser reported while the test ran').toEqual([])
  },
})

export { expect }
