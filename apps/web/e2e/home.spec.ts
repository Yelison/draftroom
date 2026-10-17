/* Home in the production build, with a real browser: a document is pinned, shown with its excerpt, and unpinned with the keyboard alone. */
import type { Locator, Page } from '@playwright/test'
import { interviews, launchPlan, weeklyEnglish } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const main = (page: Page) => page.getByRole('main')

test('pins a document, finds it on Home with its excerpt, and takes the pin off with the keyboard alone', async ({
  page,
}) => {
  await page.goto('/documents')
  const pin = main(page).getByRole('button', { name: `Pin ${weeklyEnglish.title}` })
  await expect(pin).toHaveAttribute('aria-pressed', 'false')
  await pin.focus()
  await page.keyboard.press('Enter')
  await expect(pin).toHaveAttribute('aria-pressed', 'true')
  await expect(pin).toBeFocused()

  await page.getByRole('link', { name: 'Home' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeFocused()

  const pinned = main(page).getByRole('region', { name: 'Pinned' })
  await expect(pinned.getByRole('listitem')).toHaveCount(3)
  const card = pinned.getByRole('listitem').filter({ hasText: weeklyEnglish.title })
  await expect(card).toContainText(weeklyEnglish.excerpt ?? '')
  await expect(main(page).getByRole('region', { name: 'Recent activity' })).toBeVisible()

  const unpin = card.getByRole('button', { name: `Unpin ${weeklyEnglish.title}` })
  await unpin.focus()
  await page.keyboard.press('Enter')

  await expect(pinned.getByRole('listitem')).toHaveCount(2)
  await expect(pinned.getByRole('link', { name: weeklyEnglish.title })).toHaveCount(0)
  await expect(main(page).getByRole('status').filter({ hasText: 'is no longer pinned' })).toHaveText(
    `${weeklyEnglish.title} is no longer pinned`,
  )
  // The card that took its place has the focus, so the keyboard does not start over from the top of the page.
  await expect(pinned.getByRole('button', { name: `Unpin ${interviews.title}` })).toBeFocused()
  await expect(pinned.getByRole('link', { name: launchPlan.title })).toBeVisible()
})

const looks = [
  { name: 'English, light', locale: 'en-US', colorScheme: 'light', pinned: 'Pinned' },
  { name: 'Spanish, dark', locale: 'es-ES', colorScheme: 'dark', pinned: 'Fijados' },
] as const

for (const { name, locale, colorScheme, pinned } of looks) {
  test.describe(name, () => {
    test.use({ locale, colorScheme })

    test('has no horizontal scroll at 1280 and 1440 px, and does not shift while its lists arrive', async ({
      page,
    }) => {
      for (const width of [1280, 1440]) {
        await page.setViewportSize({ width, height: 800 })
        await page.goto('/')
        await expect(
          main(page).getByRole('region', { name: pinned }).getByRole('link', { name: launchPlan.title }),
        ).toBeVisible()
        await expect(main(page).getByRole('region', { name: /^(Recent activity|Actividad reciente)$/ })).toBeVisible()

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow, `${width}px`).toBeLessThanOrEqual(0)
        const shift = await page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              let total = 0
              new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                  const layoutShift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean }
                  if (!layoutShift.hadRecentInput) total += layoutShift.value
                }
              }).observe({ type: 'layout-shift', buffered: true })
              setTimeout(() => resolve(total), 500)
            }),
        )
        expect(shift, `layout shift at ${width}px`).toBeLessThan(0.1)
      }
    })
  })
}

test('draws a pinned document differently from one that is not, on Documents and on Home', async ({ page }) => {
  const look = (button: Locator) =>
    button.evaluate((element) => ({
      color: getComputedStyle(element).color,
      fill: getComputedStyle(element.querySelector('svg') as SVGElement).fill,
    }))

  await page.goto('/documents')
  const pinned = await look(main(page).getByRole('button', { name: `Pin ${launchPlan.title}` }))
  const loose = await look(main(page).getByRole('button', { name: `Pin ${weeklyEnglish.title}` }))
  expect(pinned.fill).not.toBe('none')
  expect(loose.fill).toBe('none')
  expect(pinned.color).not.toBe(loose.color)

  await page.getByRole('link', { name: 'Home' }).click()
  const onHome = await look(main(page).getByRole('button', { name: `Unpin ${launchPlan.title}` }))
  expect(onHome).toEqual(pinned)
})

test('lets a card with a long title grow instead of spilling its text out of it', async ({ page }) => {
  const longTitle = `${'A title that someone wrote at great length '.repeat(3).trim()} and then some more words`
  await page.goto('/documents')
  await main(page)
    .getByRole('button', { name: `Actions for ${launchPlan.title}` })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Rename or move' })
  await dialog.getByRole('textbox', { name: 'Title' }).fill(longTitle)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole('link', { name: 'Home' }).click()
  const card = main(page).getByRole('region', { name: 'Pinned' }).getByRole('listitem').first().locator('> div')
  await expect(card).toContainText(longTitle)
  const { scroll, client } = await card.evaluate((element) => ({
    scroll: element.scrollHeight,
    client: element.clientHeight,
  }))
  expect(scroll).toBeLessThanOrEqual(client)
})

test('gives a typical pinned card the height of the loading cards it replaces, so the page does not move', async ({
  page,
}) => {
  // The skeleton is on screen for a moment only: its height is taken as it appears, before the cards replace it.
  await page.addInitScript(() => {
    const seen = window as unknown as { skeletonHeight?: number }
    new MutationObserver(() => {
      const row = document.querySelector('[aria-busy="true"] li')
      if (row !== null && seen.skeletonHeight === undefined) seen.skeletonHeight = row.getBoundingClientRect().height
    }).observe(document, { childList: true, subtree: true })
  })
  await page.goto('/')

  const card = main(page).getByRole('link', { name: launchPlan.title }).locator('xpath=ancestor::li[1]/div')
  await expect(card).toBeVisible()
  const skeletonHeight = await page.evaluate(() => (window as unknown as { skeletonHeight?: number }).skeletonHeight)
  const cardHeight = await card.evaluate((element) => element.getBoundingClientRect().height)
  expect(skeletonHeight, 'the skeleton was seen').toBeGreaterThan(0)
  expect(cardHeight).toBeCloseTo(skeletonHeight ?? 0, 0)
})
