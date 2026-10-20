/* Home in the production build, with a real browser: starting a document, the cards, the pinned rows, and what has to hold at every width. */
import type { Locator, Page } from '@playwright/test'
import { interviews, launchPlan } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const main = (page: Page) => page.getByRole('main')
const recent = (page: Page) =>
  main(page).getByRole('region', { name: /^(Pick up where you left off|Retoma donde lo dejaste)$/ })
const pinned = (page: Page) => main(page).getByRole('region', { name: /^(Pinned|Fijados)$/ })

/** The distinct lines a set of elements sit on: the rows of a grid, counted as the browser laid them out. */
const rowsOf = (items: Locator) =>
  items.evaluateAll(
    (elements) => new Set(elements.map((element) => Math.round(element.getBoundingClientRect().top))).size,
  )

/**
 * Pins every document the Documents screen lists that is not pinned yet, with the keyboard alone, and goes back to Home.
 * The mock lives in the page: a reload would give back its first state, so the screens are reached by their links.
 */
async function pinEverything(page: Page) {
  await page.getByRole('link', { name: 'Documents' }).click()
  const loose = main(page).getByRole('button', { name: /^Pin / })
  await expect(loose.first()).toBeVisible()
  const unpinned = loose.and(page.locator('[aria-pressed="false"]'))
  for (let left = await unpinned.count(); left > 0; left -= 1) {
    await unpinned.first().focus()
    await page.keyboard.press('Enter')
    await expect(unpinned).toHaveCount(left - 1)
  }
  await page.getByRole('link', { name: 'Home' }).click()
}

/** Makes `count` blank documents from the button on Home, so there are more documents to pin than two rows hold. */
async function makeDocuments(page: Page, count: number) {
  for (let made = 0; made < count; made += 1) {
    await main(page).getByRole('button', { name: 'New document' }).click()
    await expect(page).toHaveURL(/\/documents\/.+/)
    await page.getByRole('link', { name: 'Home' }).click()
  }
}

test('is walked from the headline to the last link with the keyboard alone, and a template starts a document', async ({
  page,
}) => {
  await page.goto('/')
  await expect(main(page).getByRole('link', { name: launchPlan.title }).first()).toBeVisible()
  await page.getByRole('heading', { level: 1, name: 'Home' }).focus()

  const order = [
    { role: 'button', name: 'New document' },
    { role: 'button', name: /Meeting notes/ },
    { role: 'button', name: /Project brief/ },
    { role: 'button', name: /Weekly update/ },
    { role: 'link', name: launchPlan.title },
  ] as const
  for (const { role, name } of order) {
    await page.keyboard.press('Tab')
    await expect(page.getByRole(role, { name }).first()).toBeFocused()
  }
  for (let card = 0; card < 2; card += 1) await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(pinned(page).getByRole('link').first()).toBeFocused()
  for (let chip = 0; chip < 2; chip += 1) await page.keyboard.press('Tab')
  await expect(main(page).getByRole('link', { name: 'See all activity' })).toBeFocused()

  await main(page)
    .getByRole('button', { name: /Project brief/ })
    .focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/documents\/.+/)
  await expect(page.getByRole('heading', { level: 1, name: 'Project brief' })).toBeVisible()
})

test('shows a pinned document as a chip with a filled star, drawn like the pin of the Documents screen', async ({
  page,
}) => {
  const look = (button: Locator) =>
    button.evaluate((element) => ({
      color: getComputedStyle(element).color,
      fill: getComputedStyle(element.querySelector('svg path') as SVGPathElement).fill,
    }))

  await page.goto('/documents')
  const onDocuments = await look(main(page).getByRole('button', { name: `Pin ${launchPlan.title}` }))
  expect(onDocuments.fill).not.toBe('none')

  await page.getByRole('link', { name: 'Home' }).click()
  const chip = pinned(page).getByRole('link', { name: launchPlan.title })
  await expect(chip).toBeVisible()
  expect(await look(chip.locator('svg'))).toEqual(onDocuments)
})

test('draws two rows of chips and unfolds the rest in place with the focus on the first new chip, then folds them', async ({
  page,
}) => {
  await page.goto('/')
  await makeDocuments(page, 2)
  await pinEverything(page)
  const chips = pinned(page).getByRole('link')
  const label = await pinned(page)
    .getByRole('button', { name: /^Show all \d+ pinned$/ })
    .textContent()
  const total = Number(label?.match(/\d+/)?.[0])
  expect(total).toBeGreaterThan(8)

  const toggle = pinned(page).getByRole('button', { name: `Show all ${total} pinned` })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(await rowsOf(chips)).toBe(2)
  await expect(chips).toHaveCount(8)

  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(pinned(page).getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true')
  await expect(chips).toHaveCount(total)
  expect(await rowsOf(chips)).toBeGreaterThan(2)
  await expect(chips.nth(8)).toBeFocused()

  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Shift+Tab')
  await pinned(page).getByRole('button', { name: 'Show fewer' }).focus()
  await page.keyboard.press('Enter')
  await expect(chips).toHaveCount(8)
  expect(await rowsOf(chips)).toBe(2)
  await expect(pinned(page).getByRole('button', { name: `Show all ${total} pinned` })).toBeFocused()
})

test('keeps two rows of chips, and the button, when the window is zoomed to 200 %', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 360 })
  await page.goto('/')
  await pinEverything(page)

  const chips = pinned(page).getByRole('link')
  await expect(pinned(page).getByRole('button', { name: /^Show all \d+ pinned$/ })).toBeVisible()
  expect(await rowsOf(chips)).toBe(2)
  expect(await chips.count()).toBe(4)
})

test('lets a card and a chip with a long title grow instead of spilling their text out of them', async ({ page }) => {
  const longTitle = `${'A title that someone wrote at great length '.repeat(3).trim()} and then some more words`
  await page.goto('/documents')
  await main(page)
    .getByRole('button', { name: `Actions for ${launchPlan.title}` })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Rename or move' })
  await dialog.getByRole('textbox', { name: 'Title' }).fill(longTitle)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole('link', { name: 'Home' }).click()
  const card = recent(page).getByRole('listitem').first()
  await expect(card).toContainText(longTitle)
  const chip = pinned(page).getByRole('link', { name: longTitle })
  for (const box of [card, chip]) {
    const { scrollHeight, clientHeight, scrollWidth, clientWidth } = await box.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }))
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  }
})

const widths = [1280, 640] as const

for (const width of widths) {
  test(`gives what loads the height of its skeleton at ${width}px, so the page does not move`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 640 ? 360 : 800 })
    // The skeleton is on screen for a moment only: its measures are taken as it appears, before the real ones replace it.
    await page.addInitScript(() => {
      const seen = window as unknown as { skeleton?: { start: number; top: number; blocks: number[] } }
      new MutationObserver(() => {
        const start = document.querySelector('main section[aria-busy="true"]')
        const blocks = [...document.querySelectorAll('main [aria-busy="true"] li')]
        if (start !== null && blocks.length >= 6 && seen.skeleton === undefined) {
          seen.skeleton = {
            start: start.getBoundingClientRect().height,
            top: start.getBoundingClientRect().top,
            blocks: blocks.map((block) => block.getBoundingClientRect().height),
          }
        }
      }).observe(document, { childList: true, subtree: true })
    })
    await page.goto('/')

    await expect(recent(page).getByRole('link', { name: launchPlan.title })).toBeVisible()
    await expect(main(page).getByRole('button', { name: /Meeting notes/ })).toBeVisible()
    const skeleton = await page.evaluate(
      () => (window as unknown as { skeleton?: { start: number; top: number; blocks: number[] } }).skeleton,
    )
    expect(skeleton, 'the skeleton was seen').toBeDefined()
    const start = await main(page)
      .getByRole('region', { name: 'Start something new' })
      .evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        top: element.getBoundingClientRect().top,
      }))
    const real = await main(page)
      .locator('li:has(> button), li:has(h3)')
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height))
    expect(start.height).toBeCloseTo(skeleton?.start ?? 0, 0)
    expect(start.top, 'where it starts').toBeCloseTo(skeleton?.top ?? 0, 0)
    expect(real).toHaveLength(6)
    real.forEach((height, index) => expect(height, `block ${index}`).toBeCloseTo(skeleton?.blocks[index] ?? 0, 0))
  })
}

test('cuts nothing and has no sideways scroll in a window of 640 × 360, which is the page zoomed to 200 %', async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 360 })
  await page.goto('/')
  await expect(recent(page).getByRole('link', { name: launchPlan.title })).toBeVisible()
  await expect(main(page).getByRole('link', { name: 'See all activity' })).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  // A box whose content is wider or taller than it is has something cut off or sticking out.
  const cut = await main(page).evaluate((root) =>
    [...root.querySelectorAll<HTMLElement>('section *')]
      .filter(
        (element) => element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).display !== 'inline',
      )
      .map((element) => element.textContent?.slice(0, 40)),
  )
  expect(cut).toEqual([])
  // The columns give way: the templates and the cards are one under another.
  expect(await rowsOf(main(page).getByRole('button', { name: /Meeting notes|Project brief|Weekly update/ }))).toBe(3)
})

const looks = [
  { name: 'English, light', locale: 'en-US', colorScheme: 'light', pinnedName: 'Pinned' },
  { name: 'Spanish, dark', locale: 'es-ES', colorScheme: 'dark', pinnedName: 'Fijados' },
] as const

for (const { name, locale, colorScheme, pinnedName } of looks) {
  test.describe(name, () => {
    test.use({ locale, colorScheme })

    test('has no horizontal scroll at 1280 and 1440 px, and does not shift while its sections arrive', async ({
      page,
    }) => {
      for (const width of [1280, 1440]) {
        await page.setViewportSize({ width, height: 800 })
        await page.goto('/')
        await expect(
          main(page).getByRole('region', { name: pinnedName }).getByRole('link', { name: launchPlan.title }),
        ).toBeVisible()
        await expect(main(page).getByRole('link', { name: /^(See all activity|Ver toda la actividad)$/ })).toBeVisible()

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow, `${width}px`).toBeLessThanOrEqual(0)
        const shift = await page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              let total = 0
              new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                  const layoutShift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean }
                  if (!layoutShift.hadRecentInput) total += layoutShift.value
                }
              }).observe({ type: 'layout-shift', buffered: true })
              setTimeout(() => resolve(total), 500)
            }),
        )
        expect(shift, `layout shift at ${width}px`).toBeLessThan(0.1)
      }
    })
  })
}

test('opens a card, and a chip, with the keyboard', async ({ page }) => {
  await page.goto('/')
  const card = recent(page).getByRole('link', { name: launchPlan.title })
  await card.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/documents/${launchPlan.id}$`))

  await page.goBack()
  const chip = pinned(page).getByRole('link', { name: interviews.title })
  await chip.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/documents/${interviews.id}$`))
})
