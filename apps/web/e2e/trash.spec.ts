/* The Trash in the production build, with a real browser: the keyboard, the focus, what is said after each action, and the geometry of the list and its panel. */
import type { Page } from '@playwright/test'
import { launchPlan, oldPricing, oldPricingSpanish } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const main = (page: Page) => page.getByRole('main')
/** The row of a document in the list, which is not the live region that names it after it has left. */
const rowOf = (page: Page, title: string) => main(page).getByRole('list').getByRole('button', { name: title })
const panelOf = (page: Page) => main(page).getByRole('region')
const restoreButton = (page: Page) => panelOf(page).getByRole('button', { name: 'Restore' })
const deleteButton = (page: Page) => panelOf(page).getByRole('button', { name: 'Delete permanently' })

/** Archives a document from the Documents screen, with the mouse: how the person gets one into the trash. */
async function archiveFromDocuments(page: Page, title: string) {
  await main(page)
    .getByRole('button', { name: `Actions for ${title}` })
    .click()
  await page.getByRole('menuitem', { name: 'Archive' }).click()
  await page
    .getByRole('dialog', { name: `Archive “${title}”?` })
    .getByRole('button', { name: 'Archive' })
    .click()
  await expect(main(page).getByRole('link', { name: title })).toHaveCount(0)
}

/** Goes to the Trash by its link, as a person does; the mock keeps its data until the page is loaded again. */
async function openTrash(page: Page) {
  await main(page).getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Trash' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Trash' })).toBeFocused()
}

test('archives a document, finds it in the Trash, restores one and deletes another with the keyboard', async ({
  page,
}) => {
  await page.goto('/documents')
  await expect(main(page).getByRole('link', { name: launchPlan.title })).toBeVisible()
  await archiveFromDocuments(page, launchPlan.title)

  // The Trash holds it, newest first, beside the two documents that were already archived, and the first is selected.
  await openTrash(page)
  await expect(main(page).getByRole('list').getByRole('listitem')).toHaveCount(3)
  await expect(main(page).getByRole('link')).toHaveCount(0)
  await expect(rowOf(page, launchPlan.title)).toHaveAttribute('aria-current', 'true')
  await expect(panelOf(page).getByRole('heading', { level: 2 })).toHaveText(launchPlan.title)

  // The list is one stop: Tab goes to the selected row, the arrow selects the next and the panel follows.
  await page.keyboard.press('Tab')
  await expect(rowOf(page, launchPlan.title)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(rowOf(page, oldPricingSpanish.title)).toHaveAttribute('aria-current', 'true')
  await expect(panelOf(page).getByRole('heading', { level: 2 })).toHaveText(oldPricingSpanish.title)

  // Restore: no question. The document leaves, it is said, and the next one is selected and has the focus.
  await page.keyboard.press('Tab')
  await expect(restoreButton(page)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(rowOf(page, oldPricingSpanish.title)).toHaveCount(0)
  await expect(main(page).getByRole('status').filter({ hasText: 'restored' })).toHaveText(
    `“${oldPricingSpanish.title}” was restored.`,
  )
  await expect(rowOf(page, oldPricing.title)).toBeFocused()
  await expect(rowOf(page, oldPricing.title)).toHaveAttribute('aria-current', 'true')

  // It is back in Documents.
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Documents' }).click()
  await expect(main(page).getByRole('link', { name: oldPricingSpanish.title })).toBeVisible()
  await openTrash(page)

  // Delete another one, with the confirmation. The last row is selected: after it leaves, the one before it is.
  await rowOf(page, oldPricing.title).click()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(deleteButton(page)).toBeFocused()
  await page.keyboard.press('Enter')

  const confirmation = page.getByRole('dialog', { name: `Delete “${oldPricing.title}” permanently?` })
  await expect(confirmation).toContainText("This can't be undone.")
  // Closing is the first answer and has the focus (the plan calls it Cancel; the dialog's own word is Close); Escape closes the dialog and the focus goes back to what opened it.
  await expect(confirmation.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirmation).toBeHidden()
  await expect(deleteButton(page)).toBeFocused()
  await expect(main(page).getByRole('list').getByRole('listitem')).toHaveCount(2)

  await page.keyboard.press('Enter')
  await expect(confirmation.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(confirmation.getByRole('button', { name: 'Delete permanently' })).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(confirmation).toBeHidden()
  await expect(rowOf(page, oldPricing.title)).toHaveCount(0)
  await expect(main(page).getByRole('status').filter({ hasText: 'deleted' })).toHaveText(
    `“${oldPricing.title}” was deleted permanently.`,
  )
  await expect(rowOf(page, launchPlan.title)).toBeFocused()
  await expect(panelOf(page).getByRole('heading', { level: 2 })).toHaveText(launchPlan.title)
})

test('does not narrow the list, or move the panel, when the selection changes', async ({ page }) => {
  await page.goto('/documents')
  await archiveFromDocuments(page, launchPlan.title)
  await openTrash(page)

  const measures = async () => {
    const list = await main(page).getByRole('list').boundingBox()
    const panel = await panelOf(page).boundingBox()
    return { listWidth: list?.width, listLeft: list?.x, panelWidth: panel?.width, panelLeft: panel?.x }
  }
  const before = await measures()
  expect(before.listWidth).toBeGreaterThan(0)
  for (const title of [oldPricingSpanish.title, oldPricing.title, launchPlan.title]) {
    await rowOf(page, title).click()
    await expect(rowOf(page, title)).toHaveAttribute('aria-current', 'true')
    expect(await measures(), `after selecting “${title}”`).toEqual(before)
  }
})

for (const width of [1280, 1440]) {
  test(`has no horizontal scroll at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/trash')
    await expect(rowOf(page, oldPricing.title)).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 640, height: 360 },
]) {
  test(`gives the list and the panel the geometry of the skeleton at ${viewport.width} px, so nothing moves when they arrive`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    // The skeleton is on screen for a moment only: its geometry is taken as it appears, before the list replaces it.
    await page.addInitScript(() => {
      const seen = window as unknown as { skeleton?: Record<string, number> }
      new MutationObserver(() => {
        if (seen.skeleton !== undefined || location.pathname !== '/trash') return
        const busy = document.querySelector('[aria-busy="true"]')
        const list = busy?.querySelector('ul')
        const row = busy?.querySelector('li')
        const panel = list?.parentElement?.lastElementChild
        const title = document.querySelector('main h1')
        if (!list || !row || !panel || !title) return
        seen.skeleton = {
          title: title.getBoundingClientRect().top,
          listLeft: list.getBoundingClientRect().left,
          listWidth: list.getBoundingClientRect().width,
          listTop: list.getBoundingClientRect().top,
          row: row.getBoundingClientRect().height,
          panelLeft: panel.getBoundingClientRect().left,
          panelWidth: panel.getBoundingClientRect().width,
        }
      }).observe(document, { childList: true, subtree: true })
    })
    await page.goto('/trash')

    const list = main(page).getByRole('list')
    await expect(rowOf(page, oldPricing.title)).toBeVisible()
    const skeleton = await page.evaluate(() => (window as unknown as { skeleton?: Record<string, number> }).skeleton)
    expect(skeleton, 'the skeleton was seen').toBeDefined()
    const real = {
      title: await main(page)
        .getByRole('heading', { level: 1 })
        .evaluate((element) => element.getBoundingClientRect().top),
      list: await list.boundingBox(),
      row: await list.getByRole('listitem').first().boundingBox(),
      panel: await panelOf(page).boundingBox(),
    }
    expect(real.title).toBeCloseTo(skeleton?.title ?? 0, 0)
    expect(real.list?.x).toBeCloseTo(skeleton?.listLeft ?? 0, 0)
    expect(real.list?.width).toBeCloseTo(skeleton?.listWidth ?? 0, 0)
    expect(real.list?.y).toBeCloseTo(skeleton?.listTop ?? 0, 0)
    expect(real.row?.height).toBeCloseTo(skeleton?.row ?? 0, 0)
    expect(real.panel?.x).toBeCloseTo(skeleton?.panelLeft ?? 0, 0)
    expect(real.panel?.width).toBeCloseTo(skeleton?.panelWidth ?? 0, 0)
  })
}

test.describe('in a window as narrow as the page zoomed to 200 %', () => {
  test.use({ viewport: { width: 640, height: 360 } })

  test('keeps every row and the panel inside the window, with the panel under the list and its actions in reach', async ({
    page,
  }) => {
    await page.goto('/documents')
    await archiveFromDocuments(page, launchPlan.title)
    await openTrash(page)

    const rows = main(page).getByRole('list').getByRole('button')
    await expect(rows).toHaveCount(3)
    for (const row of await rows.all()) {
      await expect(row).toBeVisible()
      expect((await row.boundingBox())?.width ?? 0).toBeGreaterThan(0)
    }
    const overflowing = await main(page)
      .getByRole('listitem')
      .evaluateAll((items) => items.filter((item) => item.scrollWidth > item.clientWidth).length)
    expect(overflowing).toBe(0)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(0)

    const list = await main(page).getByRole('list').boundingBox()
    const panel = await panelOf(page).boundingBox()
    expect(panel?.y ?? 0, 'the panel starts where the list ends').toBeGreaterThanOrEqual(
      (list?.y ?? 0) + (list?.height ?? 0),
    )
    for (const button of [restoreButton(page), deleteButton(page)]) {
      await button.scrollIntoViewIfNeeded()
      await expect(button).toBeInViewport({ ratio: 1 })
    }
  })
})
