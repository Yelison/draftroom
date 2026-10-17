/* Home in the production build, with a real browser: a document is pinned, shown with its excerpt, and unpinned with the keyboard alone. */
import type { Page } from '@playwright/test'
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
