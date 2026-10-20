/* The explorer and the document screens in the production build, with a real browser: the keyboard, the focus and the layout. */
import type { Page } from '@playwright/test'
import { launchPlan, weeklyEnglish } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const explorer = (page: Page) => page.getByRole('complementary', { name: 'Explorer' })
const section = (page: Page, name: string) => explorer(page).getByRole('button', { name, exact: true })
const documentLink = (page: Page, name: string) => explorer(page).getByRole('link', { name, exact: true })

/** Opens a document and waits for the explorer beside it to show its sections. */
async function openExplorer(page: Page, path = `/documents/${launchPlan.id}`) {
  await page.goto(path)
  await expect(section(page, 'Pinned')).toBeVisible()
}

test('is folded but for Pinned, marks the open document and walks the sections with the keyboard', async ({ page }) => {
  await openExplorer(page)

  await expect(section(page, 'Pinned')).toHaveAttribute('aria-expanded', 'true')
  for (const name of ['Ideas', 'Operaciones', 'Product', 'Research', 'No folder']) {
    await expect(section(page, name), name).toHaveAttribute('aria-expanded', 'false')
  }
  // The open document is the one marked as the page the person is on, and no other is.
  await expect(documentLink(page, 'Autumn launch plan')).toHaveAttribute('aria-current', 'page')
  await expect(documentLink(page, 'Customer interview synthesis')).not.toHaveAttribute('aria-current')

  // A section is opened with the keyboard, and its documents are there to be opened with it.
  await section(page, 'Research').focus()
  await expect(section(page, 'Research')).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Enter')
  await expect(section(page, 'Research')).toHaveAttribute('aria-expanded', 'true')
  await expect(documentLink(page, 'Síntesis de entrevistas con clientes')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(section(page, 'Research')).toHaveAttribute('aria-expanded', 'false')

  await documentLink(page, 'Customer interview synthesis').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/)
  await expect(page).not.toHaveURL(new RegExp(launchPlan.id))
  await expect(documentLink(page, 'Customer interview synthesis')).toHaveAttribute('aria-current', 'page')
  await expect(documentLink(page, 'Autumn launch plan')).not.toHaveAttribute('aria-current')
})

test('creates, renames and archives a document from the explorer', async ({ page }) => {
  await openExplorer(page)

  // Create: a blank document opens, and it is in "No folder", where its row is the page the person is on.
  await explorer(page).getByRole('button', { name: 'New document' }).click()
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('Untitled document')
  await section(page, 'No folder').click()
  await expect(documentLink(page, 'Untitled document')).toHaveAttribute('aria-current', 'page')

  // Rename: its menu, a new title, Save.
  await explorer(page).getByRole('button', { name: 'Actions for Untitled document' }).click()
  await page.getByRole('menuitem', { name: 'Rename or move' }).click()
  const rename = page.getByRole('dialog', { name: 'Rename or move' })
  await rename.getByRole('textbox', { name: 'Title' }).fill('Roadmap')
  await rename.getByRole('button', { name: 'Save' }).click()
  await expect(rename).toBeHidden()
  await expect(documentLink(page, 'Roadmap')).toHaveAttribute('aria-current', 'page')

  // Archive: its menu, confirm. The open document is gone, so the person lands on Documents, told what happened.
  await explorer(page).getByRole('button', { name: 'Actions for Roadmap' }).click()
  await page.getByRole('menuitem', { name: 'Archive' }).click()
  const confirmation = page.getByRole('dialog', { name: 'Archive “Roadmap”?' })
  await expect(confirmation.getByRole('button', { name: 'Close' })).toBeFocused()
  await confirmation.getByRole('button', { name: 'Archive' }).click()

  await expect(page).toHaveURL(/\/documents$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeFocused()
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'archived' })).toHaveText(
    '“Roadmap” was archived.',
  )
  await expect(page.getByRole('main').getByRole('link', { name: 'Roadmap' })).toHaveCount(0)
})

test('lists and searches the Documents screen', async ({ page }) => {
  await page.goto('/documents')
  const main = page.getByRole('main')

  await expect(main.getByRole('link', { name: 'Autumn launch plan' })).toBeVisible()
  await expect(main.getByRole('link', { name: 'Old pricing draft' })).toHaveCount(0)

  await main.getByRole('searchbox', { name: 'Search documents' }).fill('zzzz')
  await expect(main.getByText('No results for “zzzz”')).toBeVisible()

  await main.getByRole('searchbox', { name: 'Search documents' }).fill('weekly')
  await expect(main.getByRole('link', { name: 'Weekly update — October 6' })).toBeVisible()
})

test('has no horizontal scroll at 1280 and 1440 px', async ({ page }) => {
  const screens = [
    { path: '/documents', ready: page.getByRole('main').getByRole('link', { name: 'Autumn launch plan' }) },
    { path: `/documents/${weeklyEnglish.id}`, ready: section(page, 'Pinned') },
  ]
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 800 })
    for (const { path, ready } of screens) {
      await page.goto(path)
      await expect(ready).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0)
    }
  }
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

test('does not shift while the lists arrive', async ({ page }) => {
  for (const path of ['/documents', `/documents/${weeklyEnglish.id}`]) {
    await page.goto(path)
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Autumn launch plan' }).or(section(page, 'Pinned')),
    ).toBeVisible()
    expect(await shifts(page), path).toBeLessThan(0.01)
  }
})
