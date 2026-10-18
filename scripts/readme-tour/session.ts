import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { environment } from '../../apps/web/e2e-collab/environment.ts'
import { watchPolicyViolations } from '../../apps/web/e2e/policyViolations.ts'
import { message, type Language } from './messages.ts'
import { demoPassword } from './scene.ts'

export interface Viewing {
  readonly language: Language
  readonly scheme: 'light' | 'dark'
  readonly width: 1280 | 1440
  /** Records what this browser shows, at a size small enough for a short clip. */
  readonly recordTo?: string
}

const heights = { 1280: 800, 1440: 900 } as const

/** A person in a browser of their own, signed in as the real accounts are: the server sets the session cookie. */
export class Person {
  private constructor(
    readonly name: string,
    readonly language: Language,
    readonly context: BrowserContext,
    readonly page: Page,
    private readonly policyViolations: () => Promise<string[]>,
  ) {}

  static async signIn(
    browser: Browser,
    person: { readonly email: string; readonly name: string },
    viewing: Viewing,
  ): Promise<Person> {
    const height = heights[viewing.width]
    const context = await browser.newContext({
      baseURL: environment.appOrigin,
      locale: viewing.language === 'es' ? 'es-ES' : 'en-US',
      colorScheme: viewing.scheme,
      viewport: { width: viewing.width, height },
      ...(viewing.recordTo === undefined
        ? {}
        : {
            recordVideo: { dir: viewing.recordTo, size: { width: (viewing.width * 3) / 4, height: (height * 3) / 4 } },
          }),
    })
    const response = await context.request.post('/api/auth/sign-in', {
      data: { email: person.email, password: demoPassword },
    })
    expect(response.status(), `${person.name} could not sign in: was the demo seed run?`).toBe(200)
    const page = await context.newPage()
    return new Person(person.name, viewing.language, context, page, await watchPolicyViolations(page))
  }

  /** The words of the app, in this person's language. */
  say(id: string, values?: Readonly<Record<string, string>>): string {
    return message(this.language, id, values)
  }

  get editor() {
    return this.page.getByRole('textbox', { name: this.say('editor.content.label') })
  }

  /** The live region once it says "Synced": what the server stored is what the person sees, which is what a picture should show. */
  get syncedStatus() {
    const synced = this.say('sync.announcement', { status: this.say('sync.state.synced') })
    return this.page.getByRole('status').filter({ hasText: synced })
  }

  /** The avatar the screen shows for a person who is in the document. */
  presenceOf(name: string) {
    return this.page.getByRole('list', { name: this.say('presence.label') }).getByRole('img', { name })
  }

  async openDocument(documentId: string): Promise<void> {
    await this.page.goto(`/documents/${documentId}`)
    await expect(this.editor, `${this.name} could not open the document`).toBeVisible()
    // Typing before the document is synced would make a paragraph of the person's own beside the one the others wrote, which is
    // a picture of a race and not of the product.
    await expect(this.syncedStatus, `${this.name}'s document never said it was synced`).toBeAttached()
  }

  /** The paragraphs of the document, one string each, without the names that the carets of other people put in the text. */
  async paragraphs(): Promise<string[]> {
    return this.editor.evaluate((root) => {
      const copy = root.cloneNode(true) as HTMLElement
      for (const caret of copy.querySelectorAll('[class*="_caret"]')) caret.remove()
      return Array.from(copy.querySelectorAll('p'), (paragraph) => paragraph.textContent ?? '')
    })
  }

  /**
   * Waits until this person's document is exactly these paragraphs. Two people writing in one place can leave their texts in
   * either order or in one paragraph, and a picture of that would show a product that does not work as it does.
   */
  async expectParagraphs(expected: readonly string[]): Promise<void> {
    await expect
      .poll(() => this.paragraphs(), { message: `the document ${this.name} sees is not the text that was written` })
      .toEqual(expected)
  }

  /** Types after the last character, in a new paragraph when `newParagraph` says so, as a person who writes on does. */
  async typeAtEnd(text: string, { newParagraph = false } = {}): Promise<void> {
    await this.editor.click()
    await this.page.keyboard.press('Control+End')
    if (newParagraph) await this.page.keyboard.press('Enter')
    await this.page.keyboard.type(text, { delay: 12 })
  }

  /** Fails when the content security policy has refused something of what this person has done: a picture of a screen the policy broke would show a product that does not exist. */
  async expectNoPolicyViolations(): Promise<void> {
    expect(
      await this.policyViolations(),
      `the content security policy refused something while ${this.name} used the app`,
    ).toEqual([])
  }

  /** Closes the browser, keeping the recording where `keepVideoAs` says if there is one. */
  async close(keepVideoAs?: string): Promise<void> {
    await this.expectNoPolicyViolations()
    const video = this.page.video()
    await this.context.close()
    if (keepVideoAs !== undefined) await video?.saveAs(keepVideoAs)
  }
}
