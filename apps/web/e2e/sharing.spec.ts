/* Sharing in the production build, with a real browser: the share dialog, by keyboard. */
import { interviews } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

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
