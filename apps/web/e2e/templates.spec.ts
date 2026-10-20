/* Starting a document from a template in the production build, with a real browser and the keyboard alone. */
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const main = (page: Page) => page.getByRole('main')

/** Reaches a control the way a person does, by tabbing from where the focus is, never from the page body. */
async function tabTo(page: Page, target: ReturnType<Page['getByRole']>, key: 'Tab' | 'Shift+Tab' = 'Tab') {
  for (let presses = 0; presses < 40; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press(key)
  }
  throw new Error('The keyboard did not reach the control')
}

test('chooses a template with the keyboard, uses it, and opens the new document with its content', async ({ page }) => {
  await page.goto('/documents')
  const trigger = main(page).getByRole('button', { name: 'More', exact: true })
  await expect(trigger).toBeVisible()
  await tabTo(page, trigger)
  await page.keyboard.press('Enter')
  await page.getByRole('menuitem', { name: 'From a template' }).press('Enter')

  const picker = page.getByRole('dialog', { name: 'Choose a template' })
  const choice = picker.getByRole('link', { name: /Meeting notes/ })
  await expect(choice).toBeVisible()
  // The focus is already on the first template, or one Shift+Tab from it, whichever way the dialog opened.
  await tabTo(page, choice, 'Shift+Tab')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { level: 1, name: 'Meeting notes' })).toBeFocused()
  await tabTo(page, main(page).getByRole('button', { name: 'Use this template' }))
  await page.keyboard.press('Enter')

  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('Meeting notes')
  await expect(
    page.getByRole('textbox', { name: 'Document content' }).getByRole('heading', { name: 'Agenda' }),
  ).toBeVisible()
})

test('puts the focus back on the button that opened the picker when it is closed with Escape', async ({ page }) => {
  await page.goto('/documents')
  const trigger = main(page).getByRole('button', { name: 'More', exact: true })
  await tabTo(page, trigger)
  await page.keyboard.press('Enter')
  await page.getByRole('menuitem', { name: 'From a template' }).press('Enter')
  await expect(page.getByRole('dialog', { name: 'Choose a template' })).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(trigger).toBeFocused()
})

/** The sum of the layout shifts the page has had since it loaded, which the browser measures. */
const shifts = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean }
            if (!shift.hadRecentInput) total += shift.value
          }
        })
        observer.observe({ type: 'layout-shift', buffered: true })
        setTimeout(() => resolve(total), 500)
      }),
  )

test('does not shift while the page of a template arrives', async ({ page }) => {
  await page.goto('/templates/meeting-notes')
  await expect(main(page).getByRole('button', { name: 'Use this template' })).toBeVisible()

  expect(await shifts(page)).toBeLessThan(0.01)
})
