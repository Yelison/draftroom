/* The version history in the production build, with a real browser: from the editor, to a version, to a restore, and back, by keyboard. */
import type { Page } from '@playwright/test'
import { versions } from '../src/data/mock/fixtures/collaboration.ts'
import { launchPlan } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

// The name a version has for a screen reader carries the moment it was made, in the browser's time zone, which is this machine's.
const named = versions.find((version) => version.documentId === launchPlan.id && version.label !== null)
const namedWhen = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
  new Date(named?.createdAt ?? 0),
)
const namedName = `Before the pricing review, ${namedWhen}`

const list = (page: Page) => page.getByRole('region', { name: 'Versions' })

test.describe('the version history', () => {
  test('is opened from the editor, a version is read, restored and the way back to the document is the keyboard', async ({
    page,
  }) => {
    await page.goto(`/documents/${launchPlan.id}`)
    const link = page.getByRole('button', { name: 'Version history' })
    await expect(link).toBeVisible()
    await link.focus()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(new RegExp(`/documents/${launchPlan.id}/versions$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Version history' })).toBeFocused()
    await expect(list(page).getByRole('listitem')).toHaveCount(3)

    // Read the version that has a name of its own.
    const row = list(page).getByRole('button', { name: /^Before the pricing review/ })
    await row.focus()
    await page.keyboard.press('Enter')
    await expect(row).toHaveAttribute('aria-current', 'true')
    const text = page.getByRole('region', { name: `Text of “${namedName}”` })
    await expect(text.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
    await expect(text).toContainText('The launch moves to the second week of November.')

    // Restore it: the dialog opens on the way out, and the focus comes back to the button that asked.
    const restore = list(page).getByRole('button', { name: `Restore “${namedName}”` })
    await restore.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: `Restore “${namedName}”?` })
    await expect(dialog).toContainText('How it is now is saved first as a version')
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Restore' })).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(dialog).toBeHidden()
    await expect(restore).toBeFocused()
    await expect(page.getByText(/The document went back to “Before the pricing review, /)).toBeAttached()
    await expect(list(page).getByRole('listitem')).toHaveCount(5)
    await expect(list(page).getByRole('listitem').first()).toContainText('Restored version')
    await expect(list(page).getByRole('listitem').nth(1)).toContainText('Version before a restore')

    // Back to the document.
    const back = page.getByRole('link', { name: 'Back to the document “Autumn launch plan”' })
    await back.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/documents/${launchPlan.id}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Autumn launch plan' })).toBeFocused()
  })

  test('saves a version with a name, with the keyboard, and the focus comes back to the button', async ({ page }) => {
    await page.goto(`/documents/${launchPlan.id}/versions`)
    await expect(list(page).getByRole('listitem')).toHaveCount(3)
    const save = page.getByRole('button', { name: 'Save a version' })
    await save.focus()
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog', { name: 'Save a version' })
    await dialog.getByRole('textbox', { name: 'Name (optional)' }).fill('Ready for review')
    await page.keyboard.press('Enter')

    await expect(dialog).toBeHidden()
    await expect(save).toBeFocused()
    await expect(list(page).getByRole('listitem').first()).toContainText('Ready for review')
  })
})

/** The sum of the layout shifts the page has had since it loaded, which the browser measures. */
const shifts = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0
        const observer = new PerformanceObserver((entries) => {
          for (const entry of entries.getEntries()) {
            const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean }
            if (!shift.hadRecentInput) total += shift.value
          }
        })
        observer.observe({ type: 'layout-shift', buffered: true })
        setTimeout(() => resolve(total), 500)
      }),
  )

test.describe('the layout', () => {
  for (const width of [1440, 1280]) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 900 } })

      test('has no horizontal scroll with a version open', async ({ page }) => {
        await page.goto(`/documents/${launchPlan.id}/versions`)
        await list(page)
          .getByRole('button', { name: /^Before the pricing review/ })
          .click()
        await expect(page.locator('.ProseMirror[contenteditable="false"]')).toContainText('second week of November')

        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      })

      test('does not shift while the screen, the document and the versions arrive', async ({ page }) => {
        // The mock answers at once, so the placeholder would never be on screen to be measured: the code of the screen is
        // held back for a moment, which is what a slow connection does to it.
        await page.route('**/assets/VersionsScreen-*.js', async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 400))
          await route.continue()
        })
        await page.goto(`/documents/${launchPlan.id}/versions`)
        await expect(list(page).getByRole('listitem')).toHaveCount(3)

        // The screen is small, so a block that jumps scores little: what is measured is none at all, not the editor's one in a hundred.
        expect(await shifts(page)).toBeLessThan(0.001)
      })
    })
  }
})

test.describe('the header of the history with a title of 200 characters', () => {
  for (const locale of ['en-US', 'es-ES'] as const) {
    test.describe(`in ${locale} at 1280 px`, () => {
      test.use({ locale, viewport: { width: 1280, height: 900 } })

      test('keeps its buttons whole and inside the page, and names the document only in the accessible name', async ({
        page,
      }) => {
        const title = 'Un título larguísimo '.repeat(10).slice(0, 200)
        await page.goto(`/documents/${launchPlan.id}`)
        const field = page.getByRole('textbox', { name: /Document title|Título del documento/ })
        await field.fill(title)
        await field.press('Enter')
        await page.getByRole('button', { name: /Version history|Historial de versiones/ }).click()

        const back = page.getByRole('link', {
          name: new RegExp(`^(Back to the document|Volver al documento) .${title.slice(0, 20)}`),
        })
        await expect(back).toBeVisible()
        await expect(back).toHaveText(/^(Back to the document|Volver al documento)$/)
        const save = page.getByRole('button', { name: /Save a version|Guardar una versión/ })
        for (const box of [await back.boundingBox(), await save.boundingBox()]) {
          expect(box).not.toBeNull()
          expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1280)
          expect(box?.height).toBeLessThanOrEqual(48)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      })
    })
  }
})
