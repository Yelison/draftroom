/* The Trash in the production build, with a real browser: the keyboard, the focus and what is said after each action. */
import type { Page } from '@playwright/test'
import { launchPlan, oldPricing, oldPricingSpanish } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const main = (page: Page) => page.getByRole('main')
/** The row of a document in the list, which is not the live region that names it after it has left. */
const rowOf = (page: Page, title: string) => main(page).getByRole('listitem').filter({ hasText: title })
const restoreButton = (page: Page, title: string) => main(page).getByRole('button', { name: `Restore “${title}”` })
const deleteButton = (page: Page, title: string) =>
  main(page).getByRole('button', { name: `Delete “${title}” permanently` })

/** Archives a document from the Documents screen, with the mouse: how the person gets one into the trash. */
async function archiveFromDocuments(page: Page, title: string) {
  await main(page)
    .getByRole('button', { name: `Actions for ${title}` })
    .click()
  await page.getByRole('dialog', { name: 'Rename or move' }).getByRole('button', { name: 'Archive' }).click()
  await page
    .getByRole('dialog', { name: `Archive “${title}”?` })
    .getByRole('button', { name: 'Archive' })
    .click()
  await expect(main(page).getByRole('link', { name: title })).toHaveCount(0)
}

/** The same, with the keyboard alone: the way a person who does not use a pointer gets a document into the trash. */
async function archiveWithKeyboard(page: Page, title: string) {
  await main(page)
    .getByRole('button', { name: `Actions for ${title}` })
    .focus()
  await page.keyboard.press('Enter')
  await page.getByRole('dialog', { name: 'Rename or move' }).getByRole('button', { name: 'Archive' }).focus()
  await page.keyboard.press('Enter')
  const confirmation = page.getByRole('dialog', { name: `Archive “${title}”?` })
  await expect(confirmation.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(confirmation.getByRole('button', { name: 'Archive' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(main(page).getByRole('link', { name: title })).toHaveCount(0)
}

/** Goes to the Trash by its link, as a person does; the mock keeps its data until the page is loaded again. */
async function openTrash(page: Page) {
  await main(page).getByRole('link', { name: 'Trash' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Trash' })).toBeFocused()
}

test('archives a document, finds it in the Trash, restores it, then archives it again and deletes it with the keyboard', async ({
  page,
}) => {
  await page.goto('/documents')
  await expect(main(page).getByRole('link', { name: launchPlan.title })).toBeVisible()
  await archiveFromDocuments(page, launchPlan.title)

  // The Trash holds it, newest first, beside the two documents that were already archived.
  await openTrash(page)
  await expect(main(page).getByRole('listitem')).toHaveCount(3)
  await expect(main(page).getByRole('listitem').first()).toContainText(launchPlan.title)
  await expect(main(page).getByRole('link')).toHaveCount(0)

  // Restore: no question. The document leaves, it is said, and the focus is on the row that took its place.
  await restoreButton(page, launchPlan.title).focus()
  await page.keyboard.press('Enter')
  await expect(rowOf(page, launchPlan.title)).toHaveCount(0)
  await expect(main(page).getByRole('status').filter({ hasText: 'restored' })).toHaveText(
    `“${launchPlan.title}” was restored.`,
  )
  await expect(restoreButton(page, oldPricingSpanish.title)).toBeFocused()

  // It is back in Documents.
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Documents' }).click()
  await expect(main(page).getByRole('link', { name: launchPlan.title })).toBeVisible()

  // Archive it again and delete it for good, with the keyboard.
  await archiveWithKeyboard(page, launchPlan.title)
  await openTrash(page)
  await deleteButton(page, launchPlan.title).focus()
  await page.keyboard.press('Enter')

  const confirmation = page.getByRole('dialog', { name: `Delete “${launchPlan.title}” permanently?` })
  await expect(confirmation).toContainText("This can't be undone.")
  // Closing is the first answer and has the focus (the plan calls it Cancel; the dialog's own word is Close); Escape closes the dialog and the focus goes back to what opened it.
  await expect(confirmation.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirmation).toBeHidden()
  await expect(deleteButton(page, launchPlan.title)).toBeFocused()
  await expect(main(page).getByRole('listitem')).toHaveCount(3)

  await page.keyboard.press('Enter')
  await expect(confirmation.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(confirmation.getByRole('button', { name: 'Delete permanently' })).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(confirmation).toBeHidden()
  await expect(rowOf(page, launchPlan.title)).toHaveCount(0)
  await expect(main(page).getByRole('status').filter({ hasText: 'deleted' })).toHaveText(
    `“${launchPlan.title}” was deleted permanently.`,
  )
  await expect(restoreButton(page, oldPricingSpanish.title)).toBeFocused()
  await expect(main(page).getByRole('listitem')).toHaveCount(2)
  await expect(main(page).getByText(oldPricing.title)).toBeVisible()
})

test('has no horizontal scroll at 1280 and 1440 px', async ({ page }) => {
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/trash')
    await expect(main(page).getByText(oldPricing.title)).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, `at ${width}px`).toBeLessThanOrEqual(0)
  }
})
