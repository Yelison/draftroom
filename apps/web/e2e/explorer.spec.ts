/* The explorer and the document screens in the production build, with a real browser: the keyboard, the focus and the layout. */
import type { Page } from '@playwright/test'
import { launchPlan, weeklyEnglish } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const explorer = (page: Page) => page.getByRole('complementary', { name: 'Explorer' })
const tree = (page: Page) => explorer(page).getByRole('tree', { name: 'Documents and folders' })
const treeitem = (page: Page, name: string) => tree(page).getByRole('treeitem', { name, exact: true })

/** Opens a document that is not the editor's (the share route has no Tiptap) and waits for the tree. */
async function openExplorer(page: Page, path = `/documents/${weeklyEnglish.id}/share`) {
  await page.goto(path)
  await expect(tree(page)).toBeVisible()
}

/** Tabs to the tree: the skip link, the five items of the rail, the search, the two buttons and then the tree. */
async function tabToTree(page: Page) {
  for (let stop = 0; stop < 10; stop++) await page.keyboard.press('Tab')
}

test('walks the tree with the keyboard and keeps the open document selected while it does', async ({ page }) => {
  await openExplorer(page)
  await tabToTree(page)

  // The one stop of the tree is the open document, and its row is the selected one.
  const selected = tree(page).locator('[aria-selected="true"]').first()
  await expect(selected).toBeFocused()
  await expect(selected).toHaveText('Weekly update — October 6')
  await expect(selected).toHaveCSS('outline-style', 'solid')

  await page.keyboard.press('Home')
  await expect(treeitem(page, 'Recent')).toBeFocused()
  // The focus left the open document and the selection did not.
  await expect(selected).not.toBeFocused()
  await expect(selected).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('ArrowLeft')
  await expect(treeitem(page, 'Recent')).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('ArrowRight')
  await expect(treeitem(page, 'Recent')).toHaveAttribute('aria-expanded', 'true')

  await page.keyboard.press('End')
  await expect(tree(page).getByRole('treeitem').last()).toBeFocused()

  await page.keyboard.press('Home')
  await page.keyboard.type('res')
  await expect(treeitem(page, 'Research')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(treeitem(page, 'Research')).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(treeitem(page, 'Customer interview synthesis').last()).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/documents/[0-9a-f-]{36}`))
  await expect(page).not.toHaveURL(new RegExp(weeklyEnglish.id))
})

test('creates, renames and archives a document from the explorer', async ({ page }) => {
  await openExplorer(page, `/documents/${launchPlan.id}/share`)

  // Create: a blank document opens, and its row is the selected one.
  await explorer(page).getByRole('button', { name: 'New document' }).click()
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('Untitled document')
  await expect(tree(page).locator('[aria-selected="true"]').first()).toHaveText('Untitled document')

  // Rename: F2 on the row, a new title, Save.
  await tree(page).locator('[aria-selected="true"]').first().focus()
  await page.keyboard.press('F2')
  const rename = page.getByRole('dialog', { name: 'Rename or move' })
  await rename.getByRole('textbox', { name: 'Title' }).fill('Roadmap')
  await rename.getByRole('button', { name: 'Save' }).click()
  await expect(rename).toBeHidden()
  await expect(treeitem(page, 'Roadmap').first()).toBeVisible()
  await expect(tree(page).locator('[aria-selected="true"]').first()).toHaveText('Roadmap')

  // Archive: Delete, confirm. The open document is gone, so the person lands on Documents, told what happened.
  await treeitem(page, 'Roadmap').first().focus()
  await page.keyboard.press('Delete')
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

test('lists, searches and pages the Documents screen', async ({ page }) => {
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
    { path: `/documents/${weeklyEnglish.id}/share`, ready: tree(page) },
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
