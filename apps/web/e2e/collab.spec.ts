/*
 * Collaboration in the production build, with a real browser, against the simulated collaboration server of the mock:
 * what the person is told about their changes as they type, go offline and come back. The two-browser suite against the
 * real server is T2.4's; this one proves the screen, not the server.
 */
import type { Locator, Page } from '@playwright/test'
import { launchPlan } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

const documentPath = `/documents/${launchPlan.id}`
const textArea = (page: Page) => page.getByRole('textbox', { name: /Document content|Contenido del documento/ })

/** The live region of the sync status: what a screen reader is told, and the only place the state is written as a sentence. */
const syncRegion = (page: Page) =>
  page.getByRole('status').filter({ hasText: /^(Sync status|Estado de la sincronización)/ })

/** The label a person sees: the one of the pill that is drawn, not the others that only hold its width. */
const visibleLabel = (page: Page, label: string) => page.getByText(label, { exact: true }).filter({ visible: true })

async function open(page: Page) {
  await page.goto(documentPath)
  const text = textArea(page)
  await text.waitFor()
  await text.click()
  return text
}

const widthOf = async (locator: Locator) => (await locator.boundingBox())?.width ?? 0

test.describe('in English', () => {
  test.use({ locale: 'en-US', colorScheme: 'light' })

  test('goes from synchronising to synced as the change is stored, and is announced once for each', async ({
    page,
  }) => {
    await open(page)
    await expect(syncRegion(page)).toHaveText('Sync status: Synced')
    await expect(visibleLabel(page, 'Synced')).toBeVisible()

    // What the region says each time it changes, from before the first key: a region that is rewritten with every key is
    // heard with every key.
    await syncRegion(page).evaluate((region) => {
      const heard: string[] = []
      Object.assign(window, { heard })
      new MutationObserver(() => heard.push(region.textContent ?? '')).observe(region, {
        childList: true,
        characterData: true,
        subtree: true,
      })
    })

    const typed = 'The first line of the plan, typed key by key'
    await page.keyboard.type(typed)

    await expect(syncRegion(page)).toHaveText('Sync status: Synchronising')
    await expect(visibleLabel(page, 'Synchronising')).toBeVisible()
    await expect(syncRegion(page)).toHaveText('Sync status: Synced')
    await expect(visibleLabel(page, 'Synced')).toBeVisible()
    const heard = await page.evaluate((): string[] => Reflect.get(window, 'heard'))
    // Each time it speaks, the state really changed: a slow machine can store the first keys before the last are typed, and
    // then it says synchronising and synced again, but never once for each key.
    expect(heard[0]).toBe('Sync status: Synchronising')
    expect(heard.at(-1)).toBe('Sync status: Synced')
    expect(heard.filter((said, index) => said === heard[index - 1])).toEqual([])
    expect(heard.length).toBeLessThan(typed.length / 4)
  })

  test('says that the changes are on this device while offline, and stores them once the connection is back', async ({
    page,
    context,
  }) => {
    const text = await open(page)
    await expect(syncRegion(page)).toHaveText('Sync status: Synced')

    await context.setOffline(true)
    await page.keyboard.type('Written without a connection')

    await expect(syncRegion(page)).toHaveText('Sync status: Offline with local copy')
    await expect(visibleLabel(page, 'Offline with local copy')).toBeVisible()
    // Nothing says synced or saved for what is only here, and the text stays editable.
    await expect(syncRegion(page)).not.toHaveText(/synced|saved/i)
    await expect(text).toHaveAttribute('contenteditable', 'true')

    await context.setOffline(false)

    await expect(syncRegion(page)).toHaveText('Sync status: Synced', { timeout: 15_000 })
    await expect(text).toContainText('Written without a connection')
  })

  test('keeps the pill at one width whatever it says, so nothing beside it moves', async ({ page }) => {
    await open(page)
    await expect(syncRegion(page)).toHaveText('Sync status: Synced')
    // The pill is the parent of the live region it speaks in.
    const pill = syncRegion(page).locator('xpath=..')
    const synced = await widthOf(pill)

    await page.keyboard.type('Changing the state')
    await expect(syncRegion(page)).toHaveText('Sync status: Synchronising')

    expect(await widthOf(pill)).toBe(synced)
  })

  for (const width of [1280, 1440]) {
    test(`keeps the band and the sheet inside the work area at ${width} px, with no horizontal scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await open(page)
      await expect(syncRegion(page)).toHaveText('Sync status: Synced')

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
      const band = await page.getByRole('toolbar', { name: 'Formatting' }).locator('xpath=../../..').boundingBox()
      const status = await visibleLabel(page, 'Synced').boundingBox()
      expect((status?.x ?? 0) + (status?.width ?? 0)).toBeLessThanOrEqual((band?.x ?? 0) + (band?.width ?? 0))
    })
  }
})

test.describe('in Spanish', () => {
  test.use({ locale: 'es-ES', colorScheme: 'dark' })

  test('says it in Spanish, in the dark theme', async ({ page }) => {
    await open(page)
    await expect(syncRegion(page)).toHaveText('Estado de la sincronización: Sincronizado')

    await page.keyboard.type('Escribiendo en español')

    await expect(syncRegion(page)).toHaveText('Estado de la sincronización: Sincronizando')
    await expect(syncRegion(page)).toHaveText('Estado de la sincronización: Sincronizado')
  })
})
