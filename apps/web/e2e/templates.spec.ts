/* Starting a document from a template in the production build, with a real browser and the keyboard alone. */
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const main = (page: Page) => page.getByRole('main')

test('chooses a template with the keyboard, uses it, and opens the new document named after it', async ({ page }) => {
  await page.goto('/documents')
  const trigger = main(page).getByRole('button', { name: 'From a template' })
  await trigger.focus()
  await page.keyboard.press('Enter')

  const picker = page.getByRole('dialog', { name: 'Choose a template' })
  const choice = picker.getByRole('link', { name: /Meeting notes/ })
  await expect(choice).toBeVisible()
  await choice.focus()
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { level: 1, name: 'Meeting notes' })).toBeFocused()
  const use = main(page).getByRole('button', { name: 'Use this template' })
  await use.focus()
  await page.keyboard.press('Enter')

  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('Meeting notes')
  await expect(page.getByRole('textbox', { name: 'Document content' })).toBeVisible()
})

test('puts the focus back on the button that opened the picker when it is closed with Escape', async ({ page }) => {
  await page.goto('/documents')
  const trigger = main(page).getByRole('button', { name: 'From a template' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Choose a template' })).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(trigger).toBeFocused()
})
