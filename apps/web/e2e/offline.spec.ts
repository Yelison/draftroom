/*
 * What the device keeps of a document, in the production build, with a real browser and the simulated collaboration server
 * of the mock: text written without a network is still there after the page is loaded again without one, is never called
 * synced or saved while it is only on the device, and is stored once the network is back. The real server's side of it is
 * T2.4's; this spec proves the screen and the browser's storage.
 */
import type { BrowserContext, Page } from '@playwright/test'
import { launchPlan } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

const documentPath = `/documents/${launchPlan.id}`
const textArea = (page: Page) => page.getByRole('textbox', { name: /Document content|Contenido del documento/ })

/** The live region of the sync status: what a screen reader is told, and the only place the state is written as a sentence. */
const syncRegion = (page: Page) =>
  page.getByRole('status').filter({ hasText: /^(Sync status|Estado de la sincronización)/ })

type Answer = { status: number; headers: Record<string, string>; body: Buffer }

/**
 * The app has no service worker, so a page cannot be loaded again once the network is gone: the browser would refuse the
 * navigation before the app ran. What the app answered while there was a network is kept, and given back while there is
 * none, which is the part of a reload that a service worker would do and that is not what this spec is about.
 */
async function serveWhatWasLoadedWhenOffline(context: BrowserContext) {
  const answers = new Map<string, Answer>()
  let offline = false
  await context.route('**/*', async (route) => {
    const url = route.request().url()
    if (offline) {
      const answer = answers.get(url)
      return answer === undefined ? route.abort('internetdisconnected') : route.fulfill(answer)
    }
    const response = await route.fetch()
    answers.set(url, { status: response.status(), headers: response.headers(), body: await response.body() })
    return route.fulfill({ response })
  })
  return async (value: boolean) => {
    offline = value
    await context.setOffline(value)
  }
}

test.describe('in English', () => {
  test.use({ locale: 'en-US', colorScheme: 'light' })

  test('keeps what was written without a network through a reload, and stores it once the network is back', async ({
    page,
    context,
  }) => {
    const setOffline = await serveWhatWasLoadedWhenOffline(context)
    await page.goto(documentPath)
    await textArea(page).click()
    await expect(syncRegion(page)).toHaveText('Sync status: Synced')

    await setOffline(true)
    await page.keyboard.type('Written on the train')

    await expect(syncRegion(page)).toHaveText('Sync status: Offline with local copy')
    await expect(page.getByText("You're working offline")).toBeVisible()
    await expect(syncRegion(page)).not.toHaveText(/synced|saved/i)

    await page.reload()

    const text = textArea(page)
    await expect(text).toContainText('Written on the train')
    await expect(syncRegion(page)).toHaveText('Sync status: Offline with local copy')
    await expect(text).toHaveAttribute('contenteditable', 'true')

    await setOffline(false)

    await expect(syncRegion(page)).toHaveText('Sync status: Synced', { timeout: 15_000 })
    await expect(page.getByText("You're working offline")).toBeHidden()
    // Once, not twice: the copy and the server met in one document.
    expect(((await text.innerText()).match(/Written on the train/g) ?? []).length).toBe(1)
  })
})
