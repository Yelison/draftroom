/* Settings in the production build, with a real browser: the three tabs, walked with the keyboard alone. */
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const main = (page: Page) => page.getByRole('main')
const tab = (page: Page, name: string) => page.getByRole('tab', { name })

test('walks the three tabs with the arrow keys, and saves in each one with the keyboard', async ({ page }) => {
  await page.goto('/settings')
  await expect(page).toHaveURL(/\/settings\/profile$/)
  await expect(tab(page, 'Profile')).toHaveAttribute('aria-selected', 'true')

  // Profile: the name, then Save.
  const name = main(page).getByRole('textbox', { name: 'Name' })
  await expect(name).toHaveValue('Marta Ruiz')
  await name.focus()
  await page.keyboard.press('End')
  await page.keyboard.type(' Vega')
  await page.keyboard.press('Enter')
  await expect(main(page).getByText('Changes saved')).toBeVisible()

  // Workspace: moving along the tabs leaves the focus on the tab the person chose.
  await tab(page, 'Profile').focus()
  await page.keyboard.press('ArrowRight')
  await expect(tab(page, 'Workspace')).toBeFocused()
  await expect(page).toHaveURL(/\/settings\/workspace$/)
  const workspace = main(page).getByRole('textbox', { name: 'Workspace name' })
  await expect(workspace).toHaveValue('Harbor Pine')
  await workspace.focus()
  await page.keyboard.press('End')
  await page.keyboard.type(' Studio')
  await page.keyboard.press('Enter')
  await expect(main(page).getByText('Changes saved')).toBeVisible()

  // Appearance: the theme applies at once, and the text size once the server has stored it.
  await tab(page, 'Workspace').focus()
  await page.keyboard.press('ArrowRight')
  await expect(tab(page, 'Appearance')).toBeFocused()
  await main(page).getByRole('radio', { name: 'System' }).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(main(page).getByRole('radio', { name: 'Dark' })).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await main(page).getByRole('radio', { name: 'Medium' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(main(page).getByRole('radio', { name: 'Large' })).toBeChecked()
  await expect(main(page).getByText('Text size saved')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-editor-text-size', 'large')
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-doc-body')),
  ).toContain('18px')
})

test('opens in the language that was saved, and keeps the theme, on the next load', async ({ page }) => {
  await page.goto('/settings/profile')
  await main(page).getByRole('radio', { name: 'Español' }).check()
  await main(page).getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Perfil' })).toBeVisible()
  await tab(page, 'Apariencia').click()
  await main(page).getByRole('radio', { name: 'Oscuro' }).check()

  await page.reload()

  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('tab', { name: 'Apariencia' })).toBeVisible()
})
