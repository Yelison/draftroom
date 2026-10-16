/* Sharing in the production build, with a real browser: Shared with me by keyboard. */
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const main = (page: Page) => page.getByRole('main')
const filters = (page: Page) => main(page).getByRole('group', { name: 'Filter by permission' })

test.describe('Shared with me', () => {
  // Marta owns every document of her workspace, and the list leaves out the ones the person owns: it opens empty, and
  // what the keyboard can do with the filters is what can be checked here. The table and the preview are the unit tests'.
  test('is reached from the rail, and a filter is applied, kept in the address and cleared with the keyboard alone', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Shared' }).focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { level: 1, name: 'Shared' })).toBeFocused()
    await expect(main(page).getByText('Nothing has been shared with you yet')).toBeVisible()

    await filters(page).getByRole('button', { name: 'Can edit' }).focus()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/shared\?access=edit$/)
    await expect(filters(page).getByRole('button', { name: 'Can edit' })).toHaveAttribute('aria-pressed', 'true')
    await expect(main(page).getByText('No documents with this permission')).toBeVisible()

    await main(page).getByRole('button', { name: 'Show all documents' }).focus()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/shared$/)
    await expect(filters(page).getByRole('button', { name: 'All' })).toBeFocused()
    await expect(filters(page).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
  })
})
