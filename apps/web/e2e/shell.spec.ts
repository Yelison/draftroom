/* Walks the navigation of the production build with the keyboard. There is no Playwright configuration yet (the mocked
 * e2e gate brings it), so the build is served on the port of this checkout and this file alone is run:
 *
 *   npm run build -w @draftroom/web
 *   PLAYWRIGHT_PORT=<port> npm run preview -w @draftroom/web &
 *   PLAYWRIGHT_PORT=<port> npx playwright test e2e/shell.spec.ts --workers=2
 */
import { expect, test } from '@playwright/test'

const port = process.env.PLAYWRIGHT_PORT
if (port === undefined) throw new Error('PLAYWRIGHT_PORT is not set: it is the port `vite preview` serves the build on')

test.use({ baseURL: `http://localhost:${port}`, locale: 'en-US', colorScheme: 'light' })

const railItems = ['Home', 'Documents', 'Shared', 'History', 'Settings']

test('reaches the skip link and then each item of the rail with the Tab key, with a visible ring', async ({ page }) => {
  await page.goto('/')

  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()

  for (const name of railItems) {
    await page.keyboard.press('Tab')
    const item = page.getByRole('link', { name })
    await expect(item).toBeFocused()
    await expect(item).toHaveCSS('outline-style', 'solid')
  }
})

test('moves the focus to the headline of the page opened from the rail', async ({ page }) => {
  await page.goto('/')
  for (let stop = 0; stop < 5; stop++) await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'History' })).toBeFocused()

  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/history$/)
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeFocused()
  // Playwright's `getByRole` has no `current` filter, so the attribute is read as it is.
  const current = page.locator('[aria-current="page"]')
  await expect(current).toHaveCount(1)
  await expect(current).toHaveText('History')
  await expect(page).toHaveTitle('History · Draftroom')
})

test('takes the skip link to the work area without changing the address', async ({ page }) => {
  await page.goto('/documents')

  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeFocused()
  await expect(page).toHaveURL(/\/documents$/)
})
