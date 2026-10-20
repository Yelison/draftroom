/* The Members page in the production build, with a real browser: the keyboard from the rail to a removal, the skeleton's measures and the narrow window. */
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { signInAsDaniel } from './signInAs.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const main = (page: Page) => page.getByRole('main')
const rowOf = (page: Page, name: string) => main(page).getByRole('row', { name: new RegExp(name) })

test('goes from the rail to Members, filters, invites, changes a role and removes with the keyboard alone', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // The skip link, then Home, Documents, Shared, History and Members.
  for (let stop = 0; stop < 6; stop++) await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Members' })).toBeFocused()

  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/members$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeFocused()
  const current = page.locator('[aria-current="page"]')
  await expect(current).toHaveCount(1)
  await expect(current).toHaveText('Members')
  await expect(main(page).getByText('3 members, 1 pending')).toBeVisible()

  // Invite: the address, the role (left as it is) and the button are the next three stops.
  await page.keyboard.press('Tab')
  await expect(main(page).getByRole('textbox', { name: 'Email' })).toBeFocused()
  await page.keyboard.type('idris@harborpine.example')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(main(page).getByRole('button', { name: 'Invite' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(main(page).getByText('idris@harborpine.example was invited as Member.')).toBeAttached()
  await expect(main(page).getByText('3 members, 2 pending')).toBeVisible()

  // Filter: the chip is a toggle, and the table keeps only who it names.
  await main(page).getByRole('button', { name: 'Pending' }).focus()
  await page.keyboard.press('Enter')
  await expect(main(page).getByRole('button', { name: 'Pending' })).toHaveAttribute('aria-pressed', 'true')
  await expect(main(page).getByRole('row')).toHaveCount(3)
  await main(page).getByRole('button', { name: 'Everyone' }).focus()
  await page.keyboard.press('Enter')
  await expect(main(page).getByRole('row')).toHaveCount(6)

  // Role: the arrow key chooses Owner in the select of Daniel, and the page says so once the server has stored it.
  await rowOf(page, 'Daniel Okafor').getByRole('combobox').focus()
  await page.keyboard.press('ArrowDown')
  await expect(main(page).getByText('The role of Daniel Okafor is now Owner.')).toBeAttached()
  await expect(rowOf(page, 'Daniel Okafor').getByRole('combobox')).toHaveValue('owner')

  // Removing asks first: the way out has the focus, and the headline takes it back when the person is gone.
  await main(page).getByRole('button', { name: 'Remove idris@harborpine.example' }).focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Remove idris@harborpine.example?' })
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Remove' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(main(page).getByText('idris@harborpine.example was removed from the workspace.')).toBeAttached()
  await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeFocused()
})

test('reaches Members from Settings, which no longer has it as a tab', async ({ page }) => {
  await page.goto('/settings/members')

  await expect(page).toHaveURL(/\/members$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible()
  await page.goto('/settings/profile')
  await expect(page.getByRole('tab', { name: 'Members' })).toHaveCount(0)
})

interface Boxes {
  /** An owner's page has the invitation; a member's has none. */
  invite: { top: number; height: number } | null
  filters: { top: number; height: number }
  table: { top: number; head: number }
}

declare global {
  interface Window {
    skeleton?: Boxes
  }
}

/** Takes the measures of the skeleton as it appears, before the real page replaces it: it is on screen for a moment only. */
function watchSkeleton() {
  const box = (element: Element | null | undefined) => element?.getBoundingClientRect() ?? new DOMRect()
  new MutationObserver(() => {
    const skeleton = document.querySelector('main [aria-busy="true"]')
    if (skeleton === null || skeleton.children.length < 4 || window.skeleton !== undefined) return
    // Summary, invitation (an owner's only), filters, table, spoken status.
    const [, ...blocks] = skeleton.children
    const [invite, filters, table] = blocks.length === 4 ? blocks : [undefined, ...blocks]
    window.skeleton = {
      invite: invite === undefined ? null : { top: box(invite).top, height: box(invite).height },
      filters: { top: box(filters).top, height: box(filters).height },
      table: { top: box(table).top, head: box(table?.firstElementChild).height },
    }
  }).observe(document, { childList: true, subtree: true })
}

/** Where the same blocks are once the members are there. */
function measureReal(): Boxes {
  const box = (element: Element | null) => element?.getBoundingClientRect() ?? new DOMRect()
  const invite = document.querySelector('main form')
  const filters = document.querySelector('main [role="group"]')
  const panel = document.querySelector('main table')?.parentElement ?? null
  return {
    invite: invite === null ? null : { top: box(invite).top, height: box(invite).height },
    filters: { top: box(filters).top, height: box(filters).height },
    table: { top: box(panel).top, head: box(document.querySelector('main thead')).height },
  }
}

async function expectSkeletonToHaveTheMeasuresOfThePage(page: Page, hasInvitation: boolean) {
  await expect(main(page).getByRole('table')).toBeVisible()
  const skeleton = await page.evaluate(() => window.skeleton)
  expect(skeleton, 'the skeleton was seen').toBeDefined()
  const real = await page.evaluate(measureReal)
  expect(real.invite === null, 'the page has no invitation').toBe(!hasInvitation)
  expect(skeleton?.invite === null, 'the skeleton reserves no invitation').toBe(!hasInvitation)
  expect(real.invite?.top ?? 0, 'where the invitation starts').toBeCloseTo(skeleton?.invite?.top ?? 0, 0)
  expect(real.invite?.height ?? 0, 'the height of the invitation').toBeCloseTo(skeleton?.invite?.height ?? 0, 0)
  expect(real.filters.top, 'where the filters start').toBeCloseTo(skeleton?.filters.top ?? 0, 0)
  expect(real.filters.height, 'the height of the filters').toBeCloseTo(skeleton?.filters.height ?? 0, 0)
  expect(real.table.top, 'where the table starts').toBeCloseTo(skeleton?.table.top ?? 0, 0)
  expect(real.table.head, 'the height of the header').toBeCloseTo(skeleton?.table.head ?? 0, 0)
}

for (const width of [1280, 640] as const) {
  test.describe(`at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: width === 640 ? 360 : 800 })
    })

    test('gives what loads the measures of its skeleton, so the page does not move', async ({ page }) => {
      await page.addInitScript(watchSkeleton)
      await page.goto('/members')

      await expectSkeletonToHaveTheMeasuresOfThePage(page, true)
    })

    test('gives a member the skeleton of a member, who has no invitation to wait for', async ({ page }) => {
      await signInAsDaniel(page)
      // The sign-in is over: from here the page is the member's, and the way to Members is the rail's, since an address
      // typed would start the session of the demonstration over.
      await page.evaluate(watchSkeleton)
      await page.getByRole('navigation').getByRole('link', { name: 'Members' }).click()

      await expectSkeletonToHaveTheMeasuresOfThePage(page, false)
    })
  })
}

test.describe('in a window of 640 × 360, which is the page zoomed to 200 %', () => {
  test.use({ viewport: { width: 640, height: 360 } })

  test('cuts nothing, scrolls only down, and keeps the header of the table at the top while the rows go by', async ({
    page,
  }) => {
    await page.goto('/members')
    await expect(main(page).getByRole('table')).toBeVisible()

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(sideways, 'what the page scrolls sideways').toBeLessThanOrEqual(0)
    for (const button of await main(page)
      .getByRole('button', { name: /^Remove / })
      .all()) {
      const box = await button.boundingBox()
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(640)
    }
    // Far enough for the table to have gone past the top of the window: the header is what is left of it there.
    await page.mouse.wheel(0, 2000)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    const table = await main(page).getByRole('table').boundingBox()
    expect(table?.y, 'the table has gone past the top').toBeLessThan(0)
    const header = await main(page).getByRole('columnheader', { name: 'Member' }).boundingBox()
    expect(header?.y, 'the header stays at the top of the window').toBeCloseTo(0, 0)
  })
})
