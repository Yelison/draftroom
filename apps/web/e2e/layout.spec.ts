/*
 * Where the content of a page sits in the work area. On a wide window the column of a list screen is centred, so the room
 * left of it and the room right of it are the same; at a desktop width it is as wide as the work area lets it be.
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
const overviews = routes.filter((route) => overviewScreens.includes(route.name))
// The screens that are not lists but sit in a column of their own: the history of a document and the page of a template.
const columns = [
  ...routes.filter((route) => route.name === 'version history'),
  {
    name: 'template',
    open: async (page: Page) => {
      await visit(page, 'templates/meeting-notes')
      await expect(page.getByRole('heading', { level: 1 })).toBeAttached()
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
    },
  },
]

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

test.describe('the list screens on a wide window', () => {
  for (const [width, height] of [
    [1920, 1080],
    [2560, 1440],
  ] as const) {
    for (const route of [...overviews, ...columns]) {
      test(`centre their column in the work area at ${width} × ${height}: ${route.name}`, async ({ page }) => {
        await page.setViewportSize({ width, height })
        await route.open(page)

        const { before, after, area } = await roomAround(page)
        expect(area, 'there is room to spare').toBeGreaterThan(1280)
        expect(Math.abs(before - after), `room left ${before}, room right ${after}`).toBeLessThanOrEqual(2)
      })
    }
  }
})

test.describe('the list screens at a desktop width', () => {
  // The column is as wide as the work area allows, up to 1080 px: 960 px of area at 1280, and 1120 px at 1440.
  for (const [width, columnWidth] of [
    [1280, 960],
    [1440, 1080],
  ] as const) {
    for (const route of overviews) {
      test(`keep the width of their column at ${width}: ${route.name}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await route.open(page)

        const { before, width: measured } = await roomAround(page)
        expect(measured).toBeCloseTo(columnWidth, 0)
        expect(
          before,
          'the column starts at the edge of the work area unless there is room to spare',
        ).toBeGreaterThanOrEqual(0)
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
