/* Sharing in the production build, with a real browser: the share dialog and Shared with me, by keyboard. */
import type { Page } from '@playwright/test'
import { interviews } from '../src/data/mock/fixtures/documents.ts'
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

test.describe('the share dialog', () => {
  test('is opened, used to give a role, change it and take it away, and closed with the keyboard alone, and the focus ends on the button', async ({
    page,
  }) => {
    await page.goto(`/documents/${interviews.id}`)
    const share = page.getByRole('button', { name: 'Share' })
    await expect(share).toBeVisible()
    await share.focus()
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog', { name: /^Share “/ })
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/documents/${interviews.id}/share$`))
    await expect(dialog.getByRole('combobox', { name: 'Role of Sofía Lindqvist' })).toHaveValue('commenter')

    // Give Daniel a role.
    await dialog.getByRole('combobox', { name: 'Person' }).selectOption({ label: 'Daniel Okafor' })
    await dialog.getByRole('combobox', { name: 'Role', exact: true }).selectOption('editor')
    await dialog.getByRole('button', { name: 'Add' }).focus()
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('combobox', { name: 'Role of Daniel Okafor' })).toHaveValue('editor')
    await expect(dialog.getByText('Daniel Okafor was given the role Editor.')).toBeAttached()
    // Nobody is left to add, so the picker is gone with the button that was used: the focus lands in the list, once it is read again.
    await expect(dialog.getByRole('combobox', { name: 'Role of Marta Ruiz' })).toBeFocused()

    // Change it.
    await dialog.getByRole('combobox', { name: 'Role of Daniel Okafor' }).selectOption('commenter')
    await expect(dialog.getByText('The role of Daniel Okafor is now Commenter.')).toBeAttached()

    // Take it away.
    await dialog.getByRole('button', { name: 'Remove Daniel Okafor' }).focus()
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('combobox', { name: 'Role of Daniel Okafor' })).toHaveCount(0)
    await expect(dialog.getByText('Daniel Okafor no longer has access.')).toBeAttached()
    await expect(dialog.getByRole('combobox', { name: 'Role of Marta Ruiz' })).toBeFocused()

    await page.keyboard.press('Escape')

    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/documents/${interviews.id}$`))
    await expect(share).toBeFocused()
  })

  test('opens straight from its address, and the last owner cannot be lowered or removed', async ({ page }) => {
    await page.goto(`/documents/${interviews.id}/share`)

    const dialog = page.getByRole('dialog', { name: /^Share “/ })
    const owner = dialog.getByRole('combobox', { name: 'Role of Marta Ruiz' })
    await expect(owner).toHaveAttribute('aria-disabled', 'true')
    await expect(dialog.getByRole('button', { name: 'Remove Marta Ruiz' })).toHaveAttribute('aria-disabled', 'true')
    await expect(dialog.getByText(/^Last owner\./)).toBeVisible()
  })

  test('does not come back when the person goes Back after closing it', async ({ page }) => {
    await page.goto(`/documents/${interviews.id}`)
    await page.getByRole('button', { name: 'Share' }).click()
    await expect(page.getByRole('dialog', { name: /^Share “/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.goBack()

    await expect(page).not.toHaveURL(/\/share$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
