/*
 * Where the content of a page sits in the work area. On a wide window the column of a page is centred, so the room left
 * of it and the room right of it are the same; at a desktop width it is as wide as the work area lets it be.
 */
import type { Page } from '@playwright/test'
import { launchPlan } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'
import { routes, visit } from './routes.ts'

test.use({ locale: 'en-US', colorScheme: 'light' })

const overviewScreens = [
  'home',
  'documents',
  'shared with me',
  'workspace history',
  'trash',
  'search results',
  'members',
]
/** A route case of the suite by its name: one that is renamed or removed there stops this spec instead of shrinking it. */
function routeNamed(name: string) {
  const found = routes.find((route) => route.name === name)
  if (!found) throw new Error(`routes.ts has no case named "${name}"`)
  return found
}

/** Opens an address the way a person does and waits until nothing is left to arrive. */
function address(name: string, path: string) {
  return {
    name,
    open: async (page: Page) => {
      await visit(page, path)
      await expect(page.getByRole('heading', { level: 1 })).toBeAttached()
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
    },
  }
}

// Every page whose column is the one of the list screens: the lists, a folder, a template and the page that is not found.
const listColumns = [
  ...overviewScreens.map(routeNamed),
  address('folder', 'folders/design-team'),
  address('template', 'templates/meeting-notes'),
  address('not found', 'no/such/page'),
]
// The history of a document has a column of its own, wider than the lists'.
const versionsColumn = routeNamed('version history')

/** The room on each side of the column of the page inside the work area (the padding of the area is not room). */
function roomAround(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    const column = main?.firstElementChild
    if (!main || !column) throw new Error('The page has no column of content')
    const area = main.getBoundingClientRect()
    const box = column.getBoundingClientRect()
    const style = getComputedStyle(main)
    const left = area.left + parseFloat(style.paddingLeft)
    const right = area.right - parseFloat(style.paddingRight)
    return { before: box.left - left, after: right - box.right, width: box.width, area: right - left }
  })
}

test.describe('the content column on a wide window', () => {
  for (const [width, height] of [
    [1920, 1080],
    [2560, 1440],
  ] as const) {
    for (const [route, widest] of [
      ...listColumns.map((route) => [route, 1080] as const),
      [versionsColumn, 1280] as const,
    ]) {
      test(`is centred in the work area at ${width} × ${height}: ${route.name}`, async ({ page }) => {
        await page.setViewportSize({ width, height })
        await route.open(page)

        const { before, after, area, width: measured } = await roomAround(page)
        expect(area, 'there is room to spare').toBeGreaterThan(1280)
        // A column as wide as the area would be centred too, and say nothing about where its content starts.
        expect(measured, 'the column is no wider than the page').toBeLessThanOrEqual(widest)
        expect(Math.abs(before - after), `room left ${before}, room right ${after}`).toBeLessThanOrEqual(2)
      })
    }
  }
})

test.describe('the content column at a desktop width', () => {
  // The column is as wide as the work area allows, up to 1080 px: 960 px of area at 1280, and 1120 px at 1440, where 20 px are left on each side.
  for (const [width, columnWidth] of [
    [1280, 960],
    [1440, 1080],
  ] as const) {
    for (const route of listColumns) {
      test(`keeps its width and has the same room on both sides at ${width}: ${route.name}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await route.open(page)

        const { before, after, width: measured } = await roomAround(page)
        expect(measured).toBeCloseTo(columnWidth, 0)
        expect(Math.abs(before - after), `room left ${before}, room right ${after}`).toBeLessThanOrEqual(2)
      })
    }
  }
})

test('the editor at 1920 × 1080 has no sideways scroll and keeps each comment level with its text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.addInitScript(() => localStorage.setItem('draftroom.commentsPanel', 'open'))
  await page.goto(`documents/${launchPlan.id}`)
  const text = page.getByRole('textbox', { name: 'Document content' })
  await text.waitFor()
  await text.focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('A paragraph that is commented on.')
  for (let index = 0; index < 'commented on.'.length; index++) await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('ControlOrMeta+Alt+m')
  await page.getByRole('textbox', { name: 'Your comment' }).fill('Level with its text?')
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('mark')).toHaveCount(1)
  await text.evaluate((element) => element.blur())

  const { scrolls, offset, sheet, margin, work } = await page.evaluate(() => {
    const card = document.querySelector('aside [data-thread-id]')
    const mark = document.querySelector('mark[data-comment-thread]')
    const aside = card?.closest('aside')
    const sheetBox = aside?.previousElementSibling?.getBoundingClientRect()
    const asideBox = aside?.getBoundingClientRect()
    const mainBox = document.querySelector('main')?.getBoundingClientRect()
    if (!card || !mark || !sheetBox || !asideBox || !mainBox)
      throw new Error('The page is missing a part of the editor')
    return {
      scrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      offset: card.getBoundingClientRect().top - mark.getBoundingClientRect().top,
      sheet: { left: sheetBox.left },
      margin: { right: asideBox.right },
      work: { left: mainBox.left, right: mainBox.right },
    }
  })
  expect(scrolls, 'the page scrolls sideways').toBe(false)
  expect(Math.abs(offset), 'distance between the card and its text').toBeLessThanOrEqual(6)
  // The sheet and its margin are one group, centred in the work area.
  expect(
    Math.abs(sheet.left - work.left - (work.right - margin.right)),
    'room left of the group and room right of it',
  ).toBeLessThanOrEqual(2)
})
