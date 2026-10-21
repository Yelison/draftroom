/* The search results in the production build, with a real browser: from the explorer to a document, by keyboard alone. */
import type { Page } from '@playwright/test'
import { launchPlan, weeklyEnglish } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const explorer = (page: Page) => page.getByRole('complementary', { name: 'Explorer' })

/** Tabs to the search of the explorer: the skip link, the six items of the rail, signing out and then the field. */
async function tabToExplorerSearch(page: Page) {
  for (let stop = 0; stop < 9; stop++) await page.keyboard.press('Tab')
}

test('searches from the explorer, sees what matched in the title and the excerpt, and opens a document, with the keyboard', async ({
  page,
}) => {
  await page.goto(`/documents/${launchPlan.id}`)
  await expect(explorer(page).getByRole('button', { name: 'Pinned' })).toBeVisible()
  await tabToExplorerSearch(page)
  const field = explorer(page).getByRole('searchbox', { name: 'Search documents' })
  await expect(field).toBeFocused()

  await page.keyboard.type('launch')
  await page.keyboard.press('Enter')

  // The explorer filters in place while typing; Enter opens every result, and the focus goes to the new screen's title.
  await expect(page).toHaveURL(/\/search\?q=launch$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Search documents' })).toBeFocused()
  const result = page.getByRole('main').getByRole('link', { name: launchPlan.title })
  await expect(result).toBeVisible()
  const count = page.getByRole('main').getByRole('status').filter({ hasText: 'result' })
  await expect(count).toHaveText('1 result')
  // On the page for everyone, not only for a screen reader: a line of text has a box of a line, not of a pixel.
  const box = await count.boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(16)
  expect(box?.width).toBeGreaterThanOrEqual(48)
  // The folder of the result, in the row that names the document.
  const row = page.getByRole('main').locator('li').filter({ hasText: launchPlan.title })
  await expect(row.getByText('Product', { exact: true })).toBeVisible()
  // The word is marked where it was found: once in the title and once in the excerpt, and the link is named by the title.
  const marks = page.getByRole('main').locator('li mark')
  await expect(marks).toHaveText(['launch', 'launch'])
  await expect(marks.first()).toBeVisible()
  await expect(marks.last()).toBeVisible()

  // The field of the screen, then the first result.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('main').getByRole('searchbox', { name: 'Search documents' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(result).toBeFocused()
  // The ring of the card is drawn by the ::after of its link, which the stylesheet reaches but a locator does not.
  expect(await result.evaluate((link) => getComputedStyle(link, '::after').outlineStyle)).toBe('solid')
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(new RegExp(`/documents/${launchPlan.id}$`))
})

test('walks back and forward through the searches', async ({ page }) => {
  await page.goto('/search?q=weekly')
  const field = page.getByRole('main').getByRole('searchbox', { name: 'Search documents' })
  await expect(page.getByRole('main').getByRole('link', { name: weeklyEnglish.title })).toBeVisible()
  await field.focus()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('launch')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main').getByRole('link', { name: launchPlan.title })).toBeVisible()

  await page.goBack()
  await expect(page.getByRole('main').getByRole('link', { name: weeklyEnglish.title })).toBeVisible()
  await expect(field).toHaveValue('weekly')

  await page.goForward()
  await expect(field).toHaveValue('launch')
  await expect(page.getByRole('main').getByRole('link', { name: launchPlan.title })).toBeVisible()
})

test('breaks a long search instead of widening the page', async ({ page }) => {
  await page.goto(`/search?q=${'x'.repeat(200)}`)
  await expect(page.getByText(/^No results for/)).toBeVisible()

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})

for (const width of [1280, 640]) {
  test(`gives the list of results the places of its skeleton at ${width}px, so the page does not move`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 640 ? 360 : 800 })
    // The skeleton is on screen for a moment only: its measures are taken as it appears, before the real ones replace it.
    await page.addInitScript(() => {
      const seen = window as unknown as { skeleton?: { top: number; blocks: number[] } }
      new MutationObserver(() => {
        const list = document.querySelector('main [aria-busy="true"] ul')
        const blocks = [...document.querySelectorAll('main [aria-busy="true"] li')]
        if (list !== null && blocks.length >= 6 && seen.skeleton === undefined) {
          seen.skeleton = {
            top: list.getBoundingClientRect().top,
            blocks: blocks.map((block) => block.getBoundingClientRect().height),
          }
        }
      }).observe(document, { childList: true, subtree: true })
    })
    await page.goto('/search?q=the')

    await expect(page.getByRole('main').getByRole('link', { name: launchPlan.title })).toBeVisible()
    const skeleton = await page.evaluate(
      () => (window as unknown as { skeleton?: { top: number; blocks: number[] } }).skeleton,
    )
    expect(skeleton, 'the skeleton was seen').toBeDefined()
    const real = await page
      .getByRole('main')
      .locator('ul')
      .evaluate((list) => ({
        top: list.getBoundingClientRect().top,
        rows: [...list.children].map((row) => row.getBoundingClientRect().height),
      }))
    expect(real.top, 'where the list starts').toBeCloseTo(skeleton?.top ?? 0, 0)
    expect(real.rows).toHaveLength(5)
    real.rows.forEach((height, index) => expect(height, `row ${index}`).toBeCloseTo(skeleton?.blocks[index] ?? 0, 0))
  })
}

test('keeps every mark inside the line of its excerpt, so what matched can be seen, at 1280 px and in a window of 640 × 360', async ({
  page,
}) => {
  for (const size of [
    { width: 1280, height: 800 },
    { width: 640, height: 360 },
  ]) {
    await page.setViewportSize(size)
    // "signed" is near the end of the excerpt of the launch plan: in a narrow window it is past the end of the line.
    await page.goto('/search?q=signed')
    await expect(page.getByRole('main').getByRole('link', { name: launchPlan.title })).toBeVisible()

    // A line is cut at its end with an ellipsis, so a word that comes back later in it may be hidden; the first one is not.
    const hidden = await page.getByRole('main').evaluate((root) => {
      const firstOfEachLine = new Map<Element, Element>()
      for (const mark of root.querySelectorAll('li mark')) {
        if (mark.parentElement !== null && !firstOfEachLine.has(mark.parentElement)) {
          firstOfEachLine.set(mark.parentElement, mark)
        }
      }
      return [...firstOfEachLine]
        .filter(([line, mark]) => {
          const box = mark.getBoundingClientRect()
          const room = line.getBoundingClientRect()
          return box.right > room.right + 0.5 || box.left < room.left - 0.5
        })
        .map(([line]) => line.textContent?.slice(0, 40))
    })
    expect(hidden, `${size.width}px`).toEqual([])
  }
})

test('cuts nothing and has no sideways scroll in a window of 640 × 360, which is the page zoomed to 200 %', async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 360 })
  await page.goto('/search?q=the')
  const main = page.getByRole('main')
  await expect(main.getByRole('link', { name: launchPlan.title })).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  // What is outside the rows is never cut: the headline, the field, the sentence about it and the count are all there.
  const cut = await main.evaluate((root) =>
    [...root.querySelectorAll<HTMLElement>('h1, input, p, button')]
      .filter((element) => !element.closest('li') && element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.textContent?.slice(0, 40)),
  )
  expect(cut).toEqual([])
  // Inside a row, nothing sticks out of the window: the text is cut with an ellipsis, the rest is whole.
  const outside = await main.evaluate((root) =>
    [...root.querySelectorAll('li *:not(mark)')]
      .filter((element) => {
        const box = element.getBoundingClientRect()
        return box.width > 0 && (box.right > window.innerWidth + 0.5 || box.left < -0.5)
      })
      .map((element) => element.tagName),
  )
  expect(outside).toEqual([])
  await expect(main.getByRole('status').filter({ hasText: 'results' })).toHaveText('5 results')
})

test('invites to search when there is nothing to search for, and says so when nothing matches', async ({ page }) => {
  await page.goto('/search')
  await expect(page.getByText('Search your documents')).toBeVisible()
  await expect(page.getByRole('main').getByRole('searchbox')).toHaveAccessibleDescription(
    'Searches titles and the first lines of each document.',
  )

  const field = page.getByRole('main').getByRole('searchbox', { name: 'Search documents' })
  await field.fill('zzzz')
  await field.press('Enter')

  await expect(page.getByText('No results for “zzzz”')).toBeVisible()
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'results' })).toHaveText('0 results')
  await expect(page.getByRole('main').getByRole('searchbox', { name: 'Search documents' })).toBeFocused()
})
