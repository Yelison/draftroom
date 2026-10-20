/* Shared in the production build, with a real browser: the blocks of permissions, and a document opened with the keyboard alone. */
import type { Page } from '@playwright/test'
import { daniel, demoPassword } from '../src/data/mock/fixtures/people.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const main = (page: Page) => page.getByRole('main')

/** Marta owns every document, so nothing is shared with her: Daniel, who edits, comments on and reads hers, signs in. */
async function signInAsDaniel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.getByRole('textbox', { name: 'Email' }).fill(daniel.email)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/$/)
}

async function openSharedFromTheRail(page: Page) {
  await page.getByRole('link', { name: 'Shared' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Shared' })).toBeFocused()
}

test('is reached from the rail and shows a block for each permission, with its rows', async ({ page }) => {
  await signInAsDaniel(page)
  await openSharedFromTheRail(page)

  await expect(main(page).getByRole('heading', { level: 2 })).toHaveText([
    'You can edit',
    'You can comment',
    'You can view',
  ])
  await expect(main(page).getByRole('region', { name: 'You can edit 2 documents' })).toBeVisible()
  await expect(main(page).getByRole('button')).toHaveCount(0)
})

test('opens a document from its row with the keyboard alone', async ({ page }) => {
  await signInAsDaniel(page)
  await openSharedFromTheRail(page)

  await page.keyboard.press('Tab')
  const first = main(page)
    .getByRole('region', { name: /^You can edit/ })
    .getByRole('link')
    .first()
  await expect(first).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/documents\/[\w-]+$/)
})

test('says in one sentence that nothing has been shared when nothing has', async ({ page }) => {
  await page.goto('/shared')

  await expect(main(page).getByText('Nobody has shared a document with you yet.')).toBeVisible()
  await expect(main(page).getByRole('region')).toHaveCount(0)
})

test('moves neither the headline nor the first block, and gives the rows the height of the skeleton, when the list arrives', async ({
  page,
}) => {
  // The skeleton is on screen for a moment only: its geometry is taken as it appears, before the list replaces it.
  await page.addInitScript(() => {
    const seen = window as unknown as { skeleton?: { title: number; block: number; row: number } }
    new MutationObserver(() => {
      if (seen.skeleton !== undefined || location.pathname !== '/shared') return
      const busy = document.querySelector('[aria-busy="true"]')
      const block = busy?.firstElementChild
      const row = busy?.querySelector('li')
      const title = document.querySelector('main h1')
      if (!block || !row || !title) return
      seen.skeleton = {
        title: title.getBoundingClientRect().top,
        block: block.getBoundingClientRect().top,
        row: row.getBoundingClientRect().height,
      }
    }).observe(document, { childList: true, subtree: true })
  })
  await signInAsDaniel(page)
  await openSharedFromTheRail(page)

  const first = main(page).getByRole('region').first()
  await expect(first).toBeVisible()
  const skeleton = await page.evaluate(
    () => (window as unknown as { skeleton?: { title: number; block: number; row: number } }).skeleton,
  )
  expect(skeleton, 'the skeleton was seen').toBeDefined()
  const title = await main(page)
    .getByRole('heading', { level: 1 })
    .evaluate((element) => element.getBoundingClientRect().top)
  const block = await first.evaluate((element) => element.getBoundingClientRect().top)
  const row = await first
    .getByRole('listitem')
    .first()
    .evaluate((element) => element.getBoundingClientRect().height)
  expect(title).toBeCloseTo(skeleton?.title ?? 0, 0)
  expect(block).toBeCloseTo(skeleton?.block ?? 0, 0)
  expect(row).toBeCloseTo(skeleton?.row ?? 0, 0)
})

test.describe('in a window as narrow as the page zoomed to 200 %', () => {
  test.use({ viewport: { width: 640, height: 360 } })

  test('keeps the title of every row readable and each row inside its block', async ({ page }) => {
    await signInAsDaniel(page)
    await openSharedFromTheRail(page)

    const links = main(page).getByRole('region').getByRole('link')
    await expect(links).toHaveCount(6)
    for (const link of await links.all()) {
      await expect(link).toBeVisible()
      expect((await link.boundingBox())?.width ?? 0).toBeGreaterThan(0)
    }
    const overflowing = await main(page)
      .getByRole('listitem')
      .evaluateAll((rows) => rows.filter((row) => row.scrollWidth > row.clientWidth).length)
    expect(overflowing).toBe(0)
  })
})
