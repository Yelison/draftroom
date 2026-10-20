/* The Documents screen in the production build, with a real browser: the keyboard, the geometry and the narrow window. */
import type { Locator, Page } from '@playwright/test'
import { brandVoice, launchPlan, weeklyEnglish } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'
import { signInAsDaniel } from './signInAs.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const main = (page: Page) => page.getByRole('main')
const section = (page: Page, name: string) => main(page).getByRole('region', { name })

/** Walks to a control with Tab, as a person does, and fails if the keyboard never gets there. */
async function tabTo(page: Page, target: Locator) {
  for (let presses = 0; presses < 60; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('The keyboard did not reach the control')
}

test('pins, folds, moves and opens a document with the keyboard alone', async ({ page }) => {
  await page.goto('/documents')
  const pin = main(page).getByRole('button', { name: `Pin ${weeklyEnglish.title}` })
  await expect(section(page, 'No folder').getByRole('link', { name: weeklyEnglish.title })).toBeVisible()

  // Pin: the document moves to "Pinned", and the keyboard stays in the section it was in.
  await tabTo(page, pin)
  await page.keyboard.press('Enter')
  await expect(section(page, 'Pinned').getByRole('link', { name: weeklyEnglish.title })).toBeVisible()
  await expect(section(page, 'No folder').getByRole('link', { name: weeklyEnglish.title })).toHaveCount(0)
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')

  // Fold: the documents of the section go, and the button says so.
  const research = main(page).getByRole('button', { name: 'Research', exact: true })
  await tabTo(page, research)
  await page.keyboard.press('Enter')
  await expect(research).toHaveAttribute('aria-expanded', 'false')
  await expect(section(page, 'Research').getByRole('link')).toHaveCount(0)

  // Move: the menu of the row, then its dialog; the document appears in the section of the folder it went to.
  await main(page)
    .getByRole('button', { name: `Actions for ${brandVoice.title}` })
    .focus()
  await page.keyboard.press('Enter')
  await page.getByRole('menuitem', { name: 'Rename or move' }).press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Rename or move' })
  await dialog.getByRole('combobox', { name: 'Folder' }).selectOption('Ideas')
  await dialog.getByRole('button', { name: 'Save' }).press('Enter')
  await expect(dialog).toBeHidden()
  await expect(section(page, 'Ideas').getByRole('link', { name: brandVoice.title })).toBeVisible()
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')

  // Open: the title is the link.
  await section(page, 'Ideas').getByRole('link', { name: brandVoice.title }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/documents/${brandVoice.id}$`))
})

test('keeps the star and the date of every row in the same place, with a menu or without one', async ({ page }) => {
  // Daniel can change some documents and only read others, so some rows have a menu and some do not.
  await signInAsDaniel(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Documents' }).click()
  const rows = main(page).getByRole('listitem')
  await expect(rows.first()).toBeVisible()
  await expect(
    main(page)
      .getByRole('button', { name: /^Actions for / })
      .first(),
  ).toBeVisible()

  const places = await rows.evaluateAll((items) =>
    items.map((item) => ({
      star: item.querySelector('button[aria-pressed]')?.getBoundingClientRect().x,
      date: item.querySelector('time')?.getBoundingClientRect().x,
      menu: item.querySelector('button[aria-haspopup="menu"]') !== null,
    })),
  )
  expect(new Set(places.map((place) => place.menu)), 'rows with and without a menu').toEqual(new Set([true, false]))
  expect(new Set(places.map((place) => place.star)).size, 'one x for the star').toBe(1)
  expect(new Set(places.map((place) => place.date)).size, 'one x for the date').toBe(1)
})

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 640, height: 360 },
]) {
  test(`gives the sections the geometry of the skeleton at ${viewport.width} px, so nothing moves when they arrive`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    // The skeleton is on screen for a moment only: its geometry is taken as it appears, before the sections replace it.
    await page.addInitScript(() => {
      const seen = window as unknown as { skeleton?: Record<string, number> }
      new MutationObserver(() => {
        if (seen.skeleton !== undefined || location.pathname !== '/documents') return
        const busy = document.querySelector('main [aria-busy="true"]')
        const panel = busy?.firstElementChild
        const row = busy?.querySelector('li')
        const head = busy?.querySelector('[class*="toggle"]')
        const title = document.querySelector('main h1')
        if (!panel || !row || !head || !title) return
        const box = panel.getBoundingClientRect()
        seen.skeleton = {
          title: title.getBoundingClientRect().top,
          left: box.left,
          top: box.top,
          width: box.width,
          head: head.getBoundingClientRect().height,
          row: row.getBoundingClientRect().height,
        }
      }).observe(document, { childList: true, subtree: true })
    })
    await page.goto('/documents')

    const first = main(page).getByRole('region').first()
    await expect(first).toBeVisible()
    await expect(first.getByRole('listitem').first()).toBeVisible()
    const skeleton = await page.evaluate(() => (window as unknown as { skeleton?: Record<string, number> }).skeleton)
    expect(skeleton, 'the skeleton was seen').toBeDefined()
    const box = await first.boundingBox()
    const head = await first.getByRole('button').first().boundingBox()
    const row = await first.getByRole('listitem').first().boundingBox()
    const title = await main(page)
      .getByRole('heading', { level: 1 })
      .evaluate((element) => element.getBoundingClientRect().top)
    expect(title).toBeCloseTo(skeleton?.title ?? 0, 0)
    expect(box?.x).toBeCloseTo(skeleton?.left ?? 0, 0)
    expect(box?.y).toBeCloseTo(skeleton?.top ?? 0, 0)
    expect(box?.width).toBeCloseTo(skeleton?.width ?? 0, 0)
    expect(head?.height).toBeCloseTo(skeleton?.head ?? 0, 0)
    expect(row?.height).toBeCloseTo(skeleton?.row ?? 0, 0)
  })
}

test.describe('in a window as narrow as the page zoomed to 200 %', () => {
  test.use({ viewport: { width: 640, height: 360 } })

  test('keeps every row inside the window, with who, the role, when and the actions in reach', async ({ page }) => {
    await page.goto('/documents')
    await expect(main(page).getByRole('link', { name: launchPlan.title })).toBeVisible()

    const rows = main(page).getByRole('listitem')
    expect(await rows.count()).toBeGreaterThan(5)
    const clipped = await rows.evaluateAll((items) =>
      items.flatMap((item) => {
        const row = item.getBoundingClientRect()
        const outside = [...item.querySelectorAll('time, button, [data-role]')].filter((part) => {
          const box = part.getBoundingClientRect()
          return box.left < row.left - 1 || box.right > row.right + 1 || box.width === 0
        })
        return item.scrollWidth > item.clientWidth || outside.length > 0 ? [item.textContent?.slice(0, 40) ?? ''] : []
      }),
    )
    expect(clipped).toEqual([])
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(0)
  })

  test('says who made each document, when it changed and the role, on a second line of the row', async ({ page }) => {
    await page.goto('/documents')
    const row = main(page).getByRole('listitem').filter({ hasText: launchPlan.title })
    await expect(row).toBeVisible()

    const title = await row.getByRole('link', { name: launchPlan.title }).boundingBox()
    const when = await row.locator('time').boundingBox()
    expect(when?.y ?? 0, 'the date is under the title').toBeGreaterThan((title?.y ?? 0) + (title?.height ?? 0) - 1)
  })
})
