/* Settings in the production build, with a real browser: a dialog opened from the person in the rail, over the page the person is on. */
import type { Page } from '@playwright/test'
import { person } from './accountMenu.ts'
import { expect, test } from './fixtures.ts'
import { signInAsDaniel } from './signInAs.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' })

/** Opens the page and waits until it is on screen: a key pressed while the app is still mounting would be lost. */
async function open(page: Page, path: string) {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(person(page)).toBeVisible()
}

/** Tab, from the first stop of the page, to the person at the foot of the rail. */
async function tabToPerson(page: Page) {
  for (let stop = 0; stop < 30; stop++) {
    await page.keyboard.press('Tab')
    if (await person(page).evaluate((element) => element === document.activeElement)) return
  }
  throw new Error('The Tab key never reached the person in the rail')
}

test('goes from the person to Settings, changes the theme and the name with the keyboard, and closes with Escape', async ({
  page,
}) => {
  await open(page, '/documents')
  await tabToPerson(page)

  // Enter opens the menu on its first item, Settings; Enter on it opens the dialog, which has the focus.
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeVisible()
  await expect(page).toHaveURL(/\/documents\?settings=profile$/)
  expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(true)
  await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible()

  // Appearance keeps what is chosen as it is chosen.
  await dialog(page).getByRole('radio', { name: 'System' }).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(dialog(page).getByRole('radio', { name: 'Dark' })).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  // The name is kept by Save changes, and nothing says saved before the server has said so.
  const name = dialog(page).getByRole('textbox', { name: 'Name', exact: true })
  await expect(name).toHaveValue('Marta Ruiz')
  await name.focus()
  await page.keyboard.press('End')
  await page.keyboard.type(' Vega')
  await page.keyboard.press('Enter')
  await expect(dialog(page).getByText('Changes saved')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  await expect(page).toHaveURL(/\/documents$/)
  await expect(person(page)).toBeFocused()
  await expect(person(page)).toContainText('Marta Ruiz Vega')
})

test('closes the menu first with Escape, and the dialog only on the next one', async ({ page }) => {
  await open(page, '/')
  await tabToPerson(page)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(page.getByRole('menu')).toBeHidden()
  await expect(person(page)).toBeFocused()
  await expect(dialog(page)).toBeHidden()
})

test('keeps the focus inside the dialog, in both directions, and gives it back to the person on Done', async ({
  page,
}) => {
  await open(page, '/')
  await person(page).click()
  await page.getByRole('menuitem', { name: 'Settings' }).click()
  await expect(dialog(page)).toBeVisible()

  for (const key of ['Tab', 'Shift+Tab']) {
    for (let press = 0; press < 25; press++) {
      await page.keyboard.press(key)
      // Past the last control the browser hands the focus to its own chrome, which reads as the body: what it never does is
      // reach the page behind the dialog.
      expect(
        await page.evaluate(() => document.querySelector('nav, main')?.contains(document.activeElement) ?? false),
      ).toBe(false)
    }
  }
  await dialog(page).getByRole('button', { name: 'Done' }).click()

  await expect(dialog(page)).toBeHidden()
  await expect(person(page)).toBeFocused()
})

test('opens over Home for a link, and closes to Home with the focus on the person, never on the page body', async ({
  page,
}) => {
  await page.goto('/settings/appearance')

  await expect(dialog(page)).toBeVisible()
  await expect(page).toHaveURL(/\/\?settings=appearance$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible()
  await expect(dialog(page).getByRole('radio', { name: 'Light' })).toBeFocused()

  await page.keyboard.press('Escape')

  await expect(dialog(page)).toBeHidden()
  await expect(page).toHaveURL(/\/$/)
  await expect(person(page)).toBeFocused()
})

test('is closed by the Back button of the browser and the page behind is the one the person was on', async ({
  page,
}) => {
  await open(page, '/documents')
  await person(page).click()
  await page.getByRole('menuitem', { name: 'Settings' }).click()
  await expect(dialog(page)).toBeVisible()

  await page.goBack()

  await expect(dialog(page)).toBeHidden()
  await expect(page).toHaveURL(/\/documents$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible()
  await expect(person(page)).toBeFocused()
})

test('opens over the editor without taking the document from behind it', async ({ page }) => {
  await open(page, '/documents/new')
  const headline = page.getByRole('heading', { level: 1 }).first()
  await headline.evaluate((element) => element.setAttribute('data-kept', 'yes'))

  await person(page).click()
  await page.getByRole('menuitem', { name: 'Settings' }).click()
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(dialog(page)).toBeHidden()
  await expect(headline).toHaveAttribute('data-kept', 'yes')
})

test('does not let a member rename the workspace, and says why', async ({ page }) => {
  await signInAsDaniel(page)

  await person(page).click()
  await page.getByRole('menuitem', { name: 'Settings' }).click()

  const workspace = dialog(page).getByRole('textbox', { name: 'Workspace name' })
  await expect(workspace).toHaveAttribute('readonly', '')
  await expect(dialog(page).getByText('Only owners can rename the workspace.')).toBeVisible()
})

test('opens in the language that was saved, and keeps the theme, on the next load', async ({ page }) => {
  await page.goto('/?settings=profile')
  await dialog(page).getByRole('radio', { name: 'Español' }).check()
  await dialog(page).getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('dialog', { name: 'Configuración' })).toBeVisible()
  await page.getByRole('dialog').getByRole('radio', { name: 'Oscuro' }).check()

  await page.reload()

  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('dialog', { name: 'Configuración' })).toBeVisible()
})

test.describe('zoomed to 200 % in a window of 1280 px', () => {
  test.use({ viewport: { width: 640, height: 360 } })

  test('scrolls inside the window, with every control reachable and nothing cut', async ({ page }) => {
    await page.goto('/?settings=profile')
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByRole('textbox', { name: 'Workspace name' })).toBeAttached()

    const box = await dialog(page).boundingBox()
    expect(box?.y).toBeGreaterThanOrEqual(0)
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(360)
    expect(box?.width).toBeLessThanOrEqual(640)
    // The dialog scrolls as a whole, footer included: what is below the fold is reached by scrolling and by the Tab key.
    for (const control of [
      dialog(page).getByRole('textbox', { name: 'Workspace name' }),
      dialog(page).getByRole('button', { name: 'Done' }),
      dialog(page).getByRole('button', { name: 'Save changes' }),
    ]) {
      await control.scrollIntoViewIfNeeded()
      await expect(control).toBeInViewport()
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true)
  })
})

test('does not move while its data arrives', async ({ page }) => {
  await open(page, '/')
  await page.evaluate(() => {
    const heights: number[] = []
    Object.assign(window, { settingsHeights: heights })
    new MutationObserver(() => {
      const box = document.querySelector('dialog[open]')?.getBoundingClientRect()
      if (box !== undefined) heights.push(Math.round(box.height))
    }).observe(document.body, { subtree: true, childList: true, attributes: true })
  })

  await person(page).click()
  await page.getByRole('menuitem', { name: 'Settings' }).click()
  await expect(dialog(page).getByRole('textbox', { name: 'Workspace name' })).toBeVisible()

  const heights = await page.evaluate(() => (window as unknown as { settingsHeights: number[] }).settingsHeights)
  expect(heights.length).toBeGreaterThan(0)
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1)
})
