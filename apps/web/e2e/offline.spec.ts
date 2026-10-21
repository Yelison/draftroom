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
    await expect(page.getByText(/stays on this device until the connection is back/)).toBeVisible()
    await expect(syncRegion(page)).not.toHaveText(/synced|saved/i)

    await page.reload()

    const text = textArea(page)
    await expect(text).toContainText('Written on the train')
    await expect(syncRegion(page)).toHaveText('Sync status: Offline with local copy')
    await expect(text).toHaveAttribute('contenteditable', 'true')

    await setOffline(false)

    await expect(syncRegion(page)).toHaveText('Sync status: Synced', { timeout: 15_000 })
    await expect(page.getByText(/stays on this device/)).toBeHidden()
    // Once, not twice: the copy and the server met in one document.
    expect(((await text.innerText()).match(/Written on the train/g) ?? []).length).toBe(1)
  })
})

const titleField = (page: Page) => page.getByRole('textbox', { name: /Document title|Título del documento/ })

/** Where the sheet's two text areas are: the title and the text. */
async function positionsOf(page: Page) {
  return { title: await titleField(page).boundingBox(), text: await textArea(page).boundingBox() }
}

// Run with the font of the app and with a wide one (what a machine without Inter falls back to: DejaVu Sans on a CI runner),
// at the widths where the sheet is narrow too: how many lines the notice takes depends on the font and on the width, and it
// must not cover the title in any of them.
for (const { font, css } of [
  { font: 'the font of the app', css: null },
  {
    font: 'a wide fallback font',
    css: '*, *::before, *::after { font-family: "DejaVu Sans", sans-serif !important; }',
  },
]) {
  for (const { locale, colorScheme, notice } of [
    { locale: 'en-US', colorScheme: 'light', notice: /stays on this device until the connection is back/ },
    { locale: 'es-ES', colorScheme: 'dark', notice: /se queda en este dispositivo hasta que vuelva la conexión/ },
  ] as const) {
    for (const width of [375, 640, 1280, 1440]) {
      test.describe(`the notice about working offline, in ${locale} at ${width} px, with ${font}`, () => {
        test.use({ locale, colorScheme, viewport: { width, height: 900 } })

        test('is laid over the top of the sheet, above the title, and moves nothing when the network goes or comes back', async ({
          page,
          context,
        }) => {
          await page.goto(documentPath)
          if (css !== null) await page.addStyleTag({ content: css })
          await textArea(page).click()
          await expect(syncRegion(page)).toHaveText(/Synced|Sincronizado/)
          const before = await positionsOf(page)
          const overflowOf = () =>
            page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
          const overflowBefore = await overflowOf()

          await context.setOffline(true)
          const shown = page.getByText(notice)
          await expect(shown).toBeVisible()
          await page.keyboard.type('Written offline')

          // Nothing under it moved.
          expect(await positionsOf(page)).toEqual(before)
          // Wherever it is, in whatever font: it does not cover the title, and it does not reach the bar above the stage.
          const { lines, top, bottom, stageTop } = await shown.evaluate((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            const box = element.getBoundingClientRect()
            return {
              lines: range.getClientRects().length,
              top: box.top,
              bottom: box.bottom,
              stageTop: element.closest('[class*="sheet"]')?.parentElement?.getBoundingClientRect().top ?? Number.NaN,
            }
          })
          expect(bottom).toBeLessThanOrEqual(before.title?.y ?? 0)
          expect(top).toBeGreaterThanOrEqual(stageTop)
          // Two lines is what the room of the sheet holds; a third one, on a phone, is taken from the stage above it.
          expect(lines).toBeLessThanOrEqual(width < 640 ? 3 : 2)
          // It adds no width to the page (a phone's width has some of its own, which the notice does not make worse).
          expect(await overflowOf()).toBeLessThanOrEqual(overflowBefore)

          await context.setOffline(false)
          await expect(shown).toBeHidden()
          await expect(syncRegion(page)).toHaveText(/Synced|Sincronizado/, { timeout: 15_000 })
          expect(await positionsOf(page)).toEqual(before)
        })
      })
    }
  }
}
