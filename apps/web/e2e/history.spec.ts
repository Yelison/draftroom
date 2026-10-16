/* The History screen in the production build, with a real browser: the filters with the keyboard, an event opened beside the list, the focus. */
import type { Page } from '@playwright/test'
import { daniel } from '../src/data/mock/fixtures/people.ts'
import { designReview, launchPlan } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const main = (page: Page) => page.getByRole('main')
const chip = (page: Page, name: string) => main(page).getByRole('button', { name, exact: true })
/** The rows of the timeline, which are the buttons that name an event; the filters are buttons too, and are not rows. */
const rows = (page: Page) => main(page).getByRole('listitem').getByRole('button')

test('filters the history with the keyboard, opens an event, and gives the focus back when it is closed', async ({
  page,
}) => {
  await page.goto('/history')
  await expect(rows(page)).toHaveCount(14)

  // The person chip opens its menu with the arrow, and the focus is in the search: typing narrows the names, the arrow
  // goes down to the first that is left, and Enter chooses it.
  await chip(page, 'Person').focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByLabel('Search people')).toBeFocused()
  await page.keyboard.type('dani')
  await expect(page.getByRole('menuitemradio', { name: 'Marta Ruiz' })).toHaveCount(0)
  // The way to take the filter off stays first in the list, so the name is the second stop.
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitemradio', { name: 'Anyone' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitemradio', { name: daniel.name ?? '' })).toBeFocused()
  await page.keyboard.press('Enter')

  // The menu is closed, the choice is on the chip and in the address, the list is narrowed and the chip has the focus.
  await expect(chip(page, `Person: ${daniel.name}`)).toBeFocused()
  await expect(page).toHaveURL(new RegExp(`\\?person=${daniel.id}$`))
  await expect(rows(page)).toHaveCount(3)
  await expect(main(page).getByRole('status')).toHaveText('3 events')

  // Narrowed further by document, again with the keyboard alone.
  await chip(page, 'Document').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('notas')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitemradio', { name: designReview.title })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(chip(page, `Document: ${designReview.title}`)).toBeFocused()
  await expect(rows(page)).toHaveCount(2)

  // Tab runs through the chips and the button that clears them, and then to the first event: Enter opens it beside the list.
  await page.keyboard.press('Tab')
  await expect(chip(page, `Person: ${daniel.name}`)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(chip(page, 'Period')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(main(page).getByRole('button', { name: 'Clear filters' })).toBeFocused()
  await page.keyboard.press('Tab')
  const first = rows(page).first()
  await expect(first).toBeFocused()
  await expect(first).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Enter')

  const panel = main(page).getByRole('complementary', { name: 'Event details' })
  await expect(panel).toContainText(`${daniel.name} changed who in the workspace can open “${designReview.title}”`)
  await expect(panel.getByRole('heading', { level: 2, name: 'Event details' })).toBeFocused()
  await expect(first).toHaveAttribute('aria-expanded', 'true')
  await expect(panel.getByRole('link', { name: 'Open document' })).toHaveAttribute(
    'href',
    `/documents/${designReview.id}`,
  )

  // Close is next on the Tab: Enter closes the panel and the focus is on the event again.
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(panel).toBeHidden()
  await expect(first).toBeFocused()

  // Everything off from the keyboard: the focus stays among the filters, on the first chip.
  await main(page).getByRole('button', { name: 'Clear filters' }).press('Enter')
  await expect(rows(page)).toHaveCount(14)
  await expect(chip(page, 'Document')).toBeFocused()
  await expect(page).toHaveURL(/\/history$/)
})

test('goes from the History to a document and back, twice, with the filter and the explorer both working', async ({
  page,
}) => {
  const rail = page.getByRole('navigation', { name: 'Main navigation' })
  const openFirstEvent = async () => {
    await rows(page).first().click()
    await main(page).getByRole('complementary').getByRole('link', { name: 'Open document' }).click()
  }

  await page.goto('/history')
  await expect(rows(page)).toHaveCount(14)
  await openFirstEvent()

  // The explorer of the editor reads the list of documents the filter read: it is there, and the app stands.
  await expect(page.getByRole('tree')).toBeVisible()
  await expect(page.getByText('Unexpected Application Error')).toHaveCount(0)

  await rail.getByRole('link', { name: 'History' }).click()
  await expect(rows(page)).toHaveCount(14)
  await chip(page, 'Document').click()
  await expect(page.getByRole('menuitemradio', { name: launchPlan.title })).toBeVisible()
  await page.keyboard.press('Escape')

  await openFirstEvent()
  await expect(page.getByRole('tree')).toBeVisible()
  await expect(page.getByText('Unexpected Application Error')).toHaveCount(0)
})

test('has no horizontal scroll at 1280 and 1440 px, with the panel open, in either theme', async ({ page }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/history')
      await rows(page).first().click()
      await expect(main(page).getByRole('complementary')).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `at ${width}px, ${colorScheme}`).toBeLessThanOrEqual(0)
    }
  }
})

test.describe('in Spanish', () => {
  test.use({ locale: 'es-ES' })

  test('writes the filters, the days and the events in Spanish, with no horizontal scroll', async ({ page }) => {
    await page.goto('/history')

    await expect(page.getByRole('heading', { level: 1, name: 'Historial' })).toBeVisible()
    await expect(main(page).getByRole('group', { name: 'Filtrar el historial' })).toBeVisible()
    await expect(
      main(page).getByRole('button', { name: /Marta Ruiz cambió el nombre de «Autumn launch plan»/ }),
    ).toBeVisible()
    await expect(main(page).getByRole('heading', { level: 2 }).first()).toHaveText('martes, 13 de octubre de 2026')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
