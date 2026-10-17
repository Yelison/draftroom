/* The version history in the production build, with a real browser: from the editor, to a version, to a restore, and back, by keyboard. */
import type { Page } from '@playwright/test'
import { launchPlan } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const versions = (page: Page) => page.getByRole('region', { name: 'Versions' })

test.describe('the version history', () => {
  test('is opened from the editor, a version is read, restored and the way back to the document is the keyboard', async ({
    page,
  }) => {
    await page.goto(`/documents/${launchPlan.id}`)
    const history = page.getByRole('link', { name: 'Version history' })
    await expect(history).toBeVisible()
    await history.focus()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(new RegExp(`/documents/${launchPlan.id}/versions$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Version history' })).toBeFocused()
    await expect(versions(page).getByRole('listitem')).toHaveCount(3)

    // Read the version that has a name of its own.
    const named = versions(page).getByRole('button', { name: /^Before the pricing review/ })
    await named.focus()
    await page.keyboard.press('Enter')
    await expect(named).toHaveAttribute('aria-current', 'true')
    const text = page.getByRole('document', { name: 'Text of “Before the pricing review”' })
    await expect(text).toContainText('The launch moves to the second week of November.')
    await expect(text).toHaveAttribute('contenteditable', 'false')

    // Restore it: the dialog opens on the way out, and the focus comes back to the button that asked.
    const restore = versions(page)
      .getByRole('listitem')
      .filter({ hasText: 'Saved version' })
      .getByRole('button', { name: 'Restore “Before the pricing review”' })
    await restore.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Restore “Before the pricing review”?' })
    await expect(dialog).toContainText('How it is now is saved first as a version')
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Restore' })).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(dialog).toBeHidden()
    await expect(restore).toBeFocused()
    await expect(page.getByText(/The document went back to “Before the pricing review”/)).toBeAttached()
    await expect(versions(page).getByRole('listitem')).toHaveCount(5)
    await expect(versions(page).getByRole('listitem').first()).toContainText('Restored version')
    await expect(versions(page).getByRole('listitem').nth(1)).toContainText('Version before a restore')

    // Back to the document.
    const back = page.getByRole('link', { name: 'Back to “Autumn launch plan”' })
    await back.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/documents/${launchPlan.id}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Autumn launch plan' })).toBeFocused()
  })

  test('saves a version with a name, with the keyboard, and the focus comes back to the button', async ({ page }) => {
    await page.goto(`/documents/${launchPlan.id}/versions`)
    await expect(versions(page).getByRole('listitem')).toHaveCount(3)
    const save = page.getByRole('button', { name: 'Save a version' })
    await save.focus()
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog', { name: 'Save a version' })
    await dialog.getByRole('textbox', { name: 'Name (optional)' }).fill('Ready for review')
    await page.keyboard.press('Enter')

    await expect(dialog).toBeHidden()
    await expect(save).toBeFocused()
    await expect(versions(page).getByRole('listitem').first()).toContainText('Ready for review')
  })
})
