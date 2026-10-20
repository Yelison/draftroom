/* The History screen in the production build, with a real browser: the filters and the timeline with the keyboard, a burst of renames unfolded in place, the way from a sentence to its document, and the page not moving when the events arrive. */
import type { Page } from '@playwright/test'
import { daniel } from '../src/data/mock/fixtures/people.ts'
import { designReview, launchPlan } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const main = (page: Page) => page.getByRole('main')
const chip = (page: Page, name: string) => main(page).getByRole('button', { name, exact: true })
/** The rows of the timeline: one for each event, and one for a burst of renames. */
const rows = (page: Page) => main(page).getByRole('listitem')
/** Renames a document of the explorer, as a person does from its menu. */
async function rename(page: Page, from: string, to: string) {
  await main(page)
    .getByRole('button', { name: `Actions for ${from}` })
    .click()
  await page.getByRole('menuitem', { name: 'Rename or move' }).click()
  const dialog = page.getByRole('dialog', { name: 'Rename or move' })
  await dialog.getByRole('textbox', { name: 'Title' }).fill(to)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
}

test('filters the history with the keyboard, and takes the filters off with the focus staying among them', async ({
  page,
}) => {
  await page.goto('/history')
  await expect(rows(page)).toHaveCount(14)

  // The person chip opens its menu with the arrow, and the focus is in the search: typing narrows the names, the arrow
  // goes down to the first that is left, and Enter chooses it.
  await chip(page, 'Person').focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByLabel('Search people')).toBeFocused()
  await page.keyboard.type('dani')
  await expect(page.getByRole('menuitemradio', { name: 'Marta Ruiz' })).toHaveCount(0)
  // The way to take the filter off stays first in the list, so the name is the second stop.
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitemradio', { name: 'Anyone' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitemradio', { name: daniel.name ?? '' })).toBeFocused()
  await page.keyboard.press('Enter')

  // The menu is closed, the choice is on the chip and in the address, the list is narrowed and the chip has the focus.
  await expect(chip(page, `Person: ${daniel.name}`)).toBeFocused()
  await expect(page).toHaveURL(new RegExp(`\\?person=${daniel.id}$`))
  await expect(rows(page)).toHaveCount(3)
  await expect(main(page).getByRole('status')).toHaveText('3 events')

  // Narrowed further by document, again with the keyboard alone.
  await chip(page, 'Document').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('notas')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitemradio', { name: designReview.title })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(chip(page, `Document: ${designReview.title}`)).toBeFocused()
  await expect(rows(page)).toHaveCount(2)

  // Tab runs through the chips and the button that clears them, and then to the link of the first event.
  await page.keyboard.press('Tab')
  await expect(chip(page, `Person: ${daniel.name}`)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(chip(page, 'Period')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(main(page).getByRole('button', { name: 'Clear filters' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(rows(page).first().getByRole('link', { name: designReview.title })).toBeFocused()

  // Everything off from the keyboard: the focus stays among the filters, on the first chip.
  await main(page).getByRole('button', { name: 'Clear filters' }).press('Enter')
  await expect(rows(page)).toHaveCount(14)
  await expect(chip(page, 'Document')).toBeFocused()
  await expect(page).toHaveURL(/\/history$/)
})

test('unfolds a burst of renames with the keyboard, keeps the focus on its button, and opens the document from the sentence', async ({
  page,
}) => {
  await page.goto('/documents')
  await rename(page, launchPlan.title, 'Autumn launch plan, draft')
  await rename(page, 'Autumn launch plan, draft', 'Autumn launch plan, second draft')
  await rename(page, 'Autumn launch plan, second draft', 'Autumn launch plan, final')
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'History' }).click()

  const burst = rows(page).filter({ hasText: 'was renamed 3 times' })
  await expect(burst).toHaveCount(1)
  const details = burst.getByRole('button', { name: 'Details' })
  await expect(details).toHaveAttribute('aria-expanded', 'false')
  const people = page.locator(`#${await details.getAttribute('aria-controls')}`)
  await expect(people).toBeHidden()

  // The button sits right after the interval, not at the far end of the row.
  const written = await details.locator('xpath=preceding-sibling::span[1]').boundingBox()
  const button = await details.boundingBox()
  expect((button?.x ?? 0) - ((written?.x ?? 0) + (written?.width ?? 0))).toBeLessThanOrEqual(24)

  await details.focus()
  await page.keyboard.press('Enter')
  await expect(details).toHaveAttribute('aria-expanded', 'true')
  await expect(people).toBeVisible()
  await expect(people.getByRole('listitem')).toHaveCount(3)
  await expect(details).toBeFocused()

  await page.keyboard.press('Space')
  await expect(details).toHaveAttribute('aria-expanded', 'false')
  await expect(people).toBeHidden()
  await expect(details).toBeFocused()

  // The name of the document is the way to it: the next stop of the Tab is the link, and Enter opens the editor.
  await page.keyboard.press('Shift+Tab')
  await expect(burst.getByRole('link', { name: 'Autumn launch plan, final' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/documents/${launchPlan.id}`))
  await expect(page.getByRole('tree')).toBeVisible()
})

// Run with the font of the app and with the generic one the browser falls back to, whose measures are not the same: the
// wrapping of the title must not depend on which of them the machine has.
for (const { font, css } of [
  { font: 'the font of the app', css: null },
  { font: 'a generic fallback font', css: '*, *::before, *::after { font-family: sans-serif !important; }' },
]) {
  test(`keeps the separator, the interval and the button together, and the separator off the start of a line, when the title is long, with ${font}`, async ({
    page,
  }) => {
    // As long as a title can be (200 characters) and made of wide letters, so that it wraps in any font.
    const long = 'Whimsical memoranda wandering widely '.repeat(5).trim()
    await page.goto('/documents')
    await rename(page, launchPlan.title, `${long} one`)
    await rename(page, `${long} one`, `${long} two`)
    await rename(page, `${long} two`, long)
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'History' }).click()
    if (css !== null) await page.addStyleTag({ content: css })

    const burst = rows(page).filter({ hasText: 'was renamed 3 times' })
    const title = burst.getByRole('link', { name: long })
    await expect(title).toBeVisible()
    const lines = await title.evaluate((element) => element.getClientRects().length)
    expect(lines, 'the title wraps over several lines').toBeGreaterThan(1)

    const link = await title.boundingBox()
    const separator = await burst.locator('span[aria-hidden="true"]').filter({ hasText: '·' }).boundingBox()
    const interval = await burst.locator('[id$="-interval"]').boundingBox()
    const details = await burst.getByRole('button', { name: 'Details' }).boundingBox()
    const middle = (box: typeof link) => (box?.y ?? 0) + (box?.height ?? 0) / 2
    // One line: their middles are within a few pixels, whatever their own heights.
    expect(Math.abs(middle(separator) - middle(interval))).toBeLessThan(8)
    expect(Math.abs(middle(details) - middle(interval))).toBeLessThan(8)
    // And it is not the first thing on that line: the title's last words come before it.
    expect((separator?.x ?? 0) - (link?.x ?? 0)).toBeGreaterThan(16)
  })
}

test('goes from the History to a document and back, twice, with the filter and the explorer both working', async ({
  page,
}) => {
  const rail = page.getByRole('navigation', { name: 'Main navigation' })
  const openFirstEvent = async () => {
    await rows(page).first().getByRole('link', { name: launchPlan.title }).click()
  }

  await page.goto('/history')
  await expect(rows(page)).toHaveCount(14)
  await openFirstEvent()

  // The explorer of the editor reads the list of documents the filter read: it is there, and the app stands.
  await expect(page.getByRole('tree')).toBeVisible()
  await expect(page.getByText('Unexpected Application Error')).toHaveCount(0)

  await rail.getByRole('link', { name: 'History' }).click()
  await expect(rows(page)).toHaveCount(14)
  await chip(page, 'Document').click()
  await expect(page.getByRole('menuitemradio', { name: launchPlan.title })).toBeVisible()
  await page.keyboard.press('Escape')

  await openFirstEvent()
  await expect(page.getByRole('tree')).toBeVisible()
  await expect(page.getByText('Unexpected Application Error')).toHaveCount(0)
})

// The second window is what a browser zoomed to 200 % leaves of a desktop one: the chips of the filters are taller there.
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 640, height: 360 },
]) {
  test(`does not move the headline, the filters or the rows when the events arrive in place of the skeleton, in a window of ${viewport.width} px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    // The skeleton is on screen for a moment only: what is where is taken as it appears, before the events replace it.
    await page.addInitScript(() => {
      const seen = window as unknown as { before?: Record<string, number | null> }
      const top = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().top ?? null
      new MutationObserver(() => {
        const row = document.querySelector('[aria-busy="true"] li')
        if (row !== null && seen.before === undefined) {
          seen.before = {
            title: top('h1'),
            // What is above the rows: the filters, or the place they take while the workspace is on its way.
            filters: row.closest('[aria-busy="true"]')?.previousElementSibling?.getBoundingClientRect().top ?? null,
            row: row.getBoundingClientRect().top,
            rowHeight: row.getBoundingClientRect().height,
          }
        }
      }).observe(document, { childList: true, subtree: true })
    })
    await page.goto('/history')

    const first = rows(page).first()
    await expect(first).toContainText('Marta Ruiz')
    const seen = await page.evaluate(() => (window as unknown as { before?: Record<string, number | null> }).before)
    expect(seen, 'the skeleton was seen').toBeDefined()
    const after = await page.evaluate(() => {
      const top = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().top ?? null
      const row = document.querySelector('main li[data-entry]')?.getBoundingClientRect()
      return { title: top('h1'), filters: top('[role="group"]'), row: row?.top ?? null, rowHeight: row?.height ?? null }
    })

    expect(after.title).toBeCloseTo(seen?.title ?? NaN, 0)
    expect(seen?.filters, 'the place of the filters was seen').not.toBeNull()
    expect(after.filters).toBeCloseTo(seen?.filters ?? NaN, 0)
    expect(after.row).toBeCloseTo(seen?.row ?? NaN, 0)
    expect(after.rowHeight).toBeCloseTo(seen?.rowHeight ?? NaN, 0)
  })
}

test('has no horizontal scroll at 1280 and 1440 px in either theme', async ({ page }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/history')
      await expect(rows(page).first()).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `at ${width}px, ${colorScheme}`).toBeLessThanOrEqual(0)
    }
  }
})

test.describe('in Spanish', () => {
  test.use({ locale: 'es-ES' })

  test('writes the filters, the weeks, the days and the events in Spanish, with no horizontal scroll', async ({
    page,
  }) => {
    await page.goto('/history')

    await expect(page.getByRole('heading', { level: 1, name: 'Historial' })).toBeVisible()
    await expect(main(page).getByRole('group', { name: 'Filtrar el historial' })).toBeVisible()
    await expect(rows(page).first()).toContainText('Marta Ruiz cambió el nombre de «Autumn launch plan»')
    await expect(main(page).getByRole('heading', { level: 2 }).first()).toHaveText('Semana del 12 oct')
    await expect(main(page).getByRole('heading', { level: 3 }).first()).toHaveText('martes, 13 de octubre de 2026')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
