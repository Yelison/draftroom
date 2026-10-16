/* The search results in the production build, with a real browser: from the explorer to a document, by keyboard alone. */
import type { Page } from '@playwright/test'
import { launchPlan, weeklyEnglish } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const explorer = (page: Page) => page.getByRole('complementary', { name: 'Explorer' })

/** Tabs to the search of the explorer: the skip link, the five items of the rail and then the field. */
async function tabToExplorerSearch(page: Page) {
  for (let stop = 0; stop < 7; stop++) await page.keyboard.press('Tab')
}

test('searches from the explorer, opens the results and opens a document, with the keyboard', async ({ page }) => {
  await page.goto(`/documents/${launchPlan.id}/share`)
  await expect(explorer(page).getByRole('tree', { name: 'Documents and folders' })).toBeVisible()
  await tabToExplorerSearch(page)
  const field = explorer(page).getByRole('searchbox', { name: 'Search documents' })
  await expect(field).toBeFocused()

  await page.keyboard.type('weekly')
  await page.keyboard.press('Enter')

  // The explorer filters in place while typing; Enter opens every result, and the focus goes to the new screen's title.
  await expect(page).toHaveURL(/\/search\?q=weekly$/)
  const title = page.getByRole('heading', { level: 1, name: 'Results for “weekly”' })
  await expect(title).toBeFocused()
  const result = page.getByRole('main').getByRole('link', { name: weeklyEnglish.title })
  await expect(result).toBeVisible()

  // The field of the screen, then the first result.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('main').getByRole('searchbox', { name: 'Search documents' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(result).toBeFocused()
  // The ring of the card is drawn by the ::after of its link, which the stylesheet reaches but a locator does not.
  expect(await result.evaluate((link) => getComputedStyle(link, '::after').outlineStyle)).toBe('solid')
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(new RegExp(`/documents/${weeklyEnglish.id}$`))
})

test('walks back and forward through the searches', async ({ page }) => {
  await page.goto('/search?q=weekly')
  const field = page.getByRole('main').getByRole('searchbox', { name: 'Search documents' })
  await field.fill('launch')
  await field.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Results for “launch”' })).toBeVisible()

  await page.goBack()
  await expect(page.getByRole('heading', { level: 1, name: 'Results for “weekly”' })).toBeVisible()
  await expect(field).toHaveValue('weekly')

  await page.goForward()
  await expect(field).toHaveValue('launch')
})

test('breaks a long search instead of widening the page', async ({ page }) => {
  await page.goto(`/search?q=${'x'.repeat(200)}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('xxxx')
  await expect(page.getByText(/^No results for/)).toBeVisible()

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})
