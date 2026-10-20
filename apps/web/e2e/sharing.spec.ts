/* Sharing in the production build, with a real browser: the share dialog, by keyboard, with many people and in a narrow window. */
import type { Locator, Page } from '@playwright/test'
import { interviews, launchPlan } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

declare global {
  interface Window {
    /** Where the list of the skeleton started, taken as it appeared. */
    skeleton?: number
  }
}

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const dialogOf = (page: Page) => page.getByRole('dialog', { name: /^Share “/ })
const rowOf = (dialog: Locator, name: string) => dialog.getByRole('listitem').filter({ hasText: name })
const everyone = (dialog: Locator) => dialog.getByRole('combobox', { name: 'Access for everyone in Harbor Pine' })

/** The fixtures have a handful of people, so the rows of more are copies of one, put before the row of everyone. */
const addGuestRows = (dialog: Locator, count: number) =>
  dialog.evaluate((element, copies) => {
    const first = element.querySelector('[data-row]')
    const last = element.querySelector('[data-row="general"]')
    if (first === null || last === null) throw new Error('The list has no rows to copy')
    for (let index = 0; index < copies; index++) last.before(first.cloneNode(true))
  }, count)

test.describe('the share dialog', () => {
  test('is opened, used to give a role, change it, take it away, open the document to the workspace and closed with the keyboard alone, and the focus ends on the button', async ({
    page,
  }) => {
    await page.goto(`/documents/${interviews.id}`)
    const share = page.getByRole('button', { name: 'Share' })
    await expect(share).toBeVisible()
    await share.focus()
    await page.keyboard.press('Enter')

    const dialog = dialogOf(page)
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/documents/${interviews.id}/share$`))
    await expect(dialog.getByRole('combobox', { name: 'Role of Sofía Lindqvist' })).toHaveValue('commenter')
    // The focus is in the dialog from the start, and never on the body.
    expect(await dialog.evaluate((element) => element.matches(':focus-within'))).toBe(true)

    // Give Daniel a role.
    await dialog.getByRole('combobox', { name: 'Person' }).selectOption({ label: 'Daniel Okafor' })
    await expect(dialog.getByRole('combobox', { name: /^Role$/ })).toHaveValue('viewer')
    await dialog.getByRole('combobox', { name: /^Role$/ }).selectOption('editor')
    await dialog.getByRole('button', { name: 'Add' }).focus()
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('combobox', { name: 'Role of Daniel Okafor' })).toHaveValue('editor')
    await expect(dialog.getByText('Daniel Okafor was given the role Editor.')).toBeAttached()
    // Nobody is left to add, so the picker is gone with the button that was used: the focus lands on the row of the person.
    await expect(dialog.getByRole('combobox', { name: 'Role of Daniel Okafor' })).toBeFocused()

    // Change it.
    await dialog.getByRole('combobox', { name: 'Role of Daniel Okafor' }).selectOption('commenter')
    await expect(dialog.getByText('The role of Daniel Okafor is now Commenter.')).toBeAttached()

    // Take it away: the focus goes to the row after it, the one of everyone in the workspace.
    await dialog.getByRole('button', { name: 'Remove Daniel Okafor' }).focus()
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('combobox', { name: 'Role of Daniel Okafor' })).toHaveCount(0)
    await expect(dialog.getByText('Daniel Okafor no longer has access.')).toBeAttached()
    await expect(everyone(dialog)).toBeFocused()

    // Open the document to the workspace.
    await everyone(dialog).selectOption('viewer')
    await expect(dialog.getByText('General access: Can view.')).toBeAttached()
    await expect(everyone(dialog)).toHaveValue('viewer')

    // Done closes it, and the button that opened it has the focus again.
    await dialog.getByRole('button', { name: 'Done' }).focus()
    await page.keyboard.press('Enter')

    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/documents/${interviews.id}$`))
    await expect(share).toBeFocused()
  })

  test('opens straight from its address, and the last owner cannot be lowered or removed', async ({ page }) => {
    await page.goto(`/documents/${interviews.id}/share`)

    const dialog = dialogOf(page)
    const owner = dialog.getByRole('combobox', { name: 'Role of Marta Ruiz' })
    await expect(owner).toHaveAttribute('aria-disabled', 'true')
    await expect(dialog.getByRole('button', { name: 'Remove Marta Ruiz' })).toHaveAttribute('aria-disabled', 'true')
    await expect(rowOf(dialog, 'Marta Ruiz').getByText(/^Last owner\./)).toBeVisible()
    // What cannot be used looks like it: the button of the last owner is not drawn like the one of a person who can be removed.
    const colorOf = (name: string) =>
      dialog.getByRole('button', { name }).evaluate((element) => getComputedStyle(element).color)
    expect(await colorOf('Remove Marta Ruiz')).not.toBe(await colorOf('Remove Sofía Lindqvist'))
  })

  test('keeps the avatar clear of the name in every row', async ({ page }) => {
    await page.goto(`/documents/${interviews.id}/share`)
    const dialog = dialogOf(page)
    await expect(dialog.getByRole('list')).toBeVisible()

    const gaps = await dialog.getByRole('listitem').evaluateAll((items) =>
      items.map((item) => {
        const [mark, who] = [item.children[0], item.children[1]]
        if (!mark || !who) throw new Error('A row has no mark and no name')
        return who.getBoundingClientRect().left - mark.getBoundingClientRect().right
      }),
    )
    // The gap between the columns is 12 px; half a pixel is for the rounding of the layout.
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(11.5)
  })

  test('does not come back when the person goes Back after closing it', async ({ page }) => {
    await page.goto(`/documents/${interviews.id}`)
    await page.getByRole('button', { name: 'Share' }).click()
    await expect(dialogOf(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.goBack()

    await expect(page).not.toHaveURL(/\/share$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  for (const { name, id } of [
    { name: 'a document with people left to add', id: interviews.id },
    { name: 'a document with everybody added', id: launchPlan.id },
  ]) {
    test(`does not move what is below its headings when the list of ${name} arrives in place of the skeleton`, async ({
      page,
    }) => {
      // The skeleton is on screen for a moment only: where its list starts is taken as it appears, before the list replaces it.
      // Measured by layout, not by box, because the dialog is still scaling in while the skeleton is there.
      await page.addInitScript(() => {
        new MutationObserver(() => {
          const list = document.querySelector('dialog[open] [aria-busy="true"]')?.children[1]
          if (list instanceof HTMLElement && window.skeleton === undefined) window.skeleton = list.offsetTop
        }).observe(document, { childList: true, subtree: true })
      })
      await page.goto(`/documents/${id}/share`)

      const heading = dialogOf(page).getByRole('heading', { name: 'People with access' })
      await expect(heading).toBeVisible()
      const skeleton = await page.evaluate(() => window.skeleton)
      expect(skeleton, 'the skeleton was seen').toBeDefined()
      const section = await heading.evaluate((element) =>
        element.parentElement instanceof HTMLElement ? element.parentElement.offsetTop : null,
      )
      expect(section).toBeCloseTo(skeleton ?? 0, 0)
    })
  }

  test('scrolls the list inside the dialog with many people, and keeps the row that adds people, everyone in the workspace and Done in view', async ({
    page,
  }) => {
    await page.goto(`/documents/${interviews.id}/share`)
    const dialog = dialogOf(page)
    await expect(dialog.getByRole('combobox', { name: 'Person' })).toBeVisible()

    await addGuestRows(dialog, 15)

    const list = dialog.getByRole('list')
    const metrics = await list.evaluate((element) => ({
      scrolls: element.scrollHeight > element.clientHeight,
    }))
    expect(metrics.scrolls).toBe(true)
    // The dialog itself does not scroll: it is the list that does.
    expect(await dialog.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true)
    await expect(dialog.getByRole('combobox', { name: 'Person' })).toBeInViewport({ ratio: 1 })
    await expect(dialog.getByRole('button', { name: 'Add' })).toBeInViewport({ ratio: 1 })
    await expect(dialog.getByRole('button', { name: 'Done' })).toBeInViewport({ ratio: 1 })
    // Everyone in the workspace stays at the foot of the list while the people scroll under it.
    await expect(everyone(dialog)).toBeInViewport({ ratio: 1 })
    await list.evaluate((element) => element.scrollTo({ top: 0 }))
    await expect(everyone(dialog)).toBeInViewport({ ratio: 1 })
  })

  test('does not leave the control that has the focus under the row of everyone in the workspace', async ({ page }) => {
    await page.goto(`/documents/${interviews.id}/share`)
    const dialog = dialogOf(page)
    await expect(dialog.getByRole('combobox', { name: 'Person' })).toBeVisible()
    await addGuestRows(dialog, 15)
    await dialog.getByRole('combobox', { name: 'Role of Sofía Lindqvist' }).first().focus()

    for (let step = 0; step < 24; step++) {
      await page.keyboard.press('Tab')
      const covered = await dialog.evaluate((element) => {
        const active = document.activeElement
        const everyone = element.querySelector('[data-row="general"]')
        if (!active || !everyone || everyone.contains(active) || !element.querySelector('ul')?.contains(active))
          return false
        const [a, e] = [active.getBoundingClientRect(), everyone.getBoundingClientRect()]
        return a.bottom > e.top + 0.5 && a.top < e.bottom
      })
      expect(covered, `after ${step + 1} Tab presses`).toBe(false)
    }
  })
})

test.describe('the share dialog in a window of 640 × 360 px, which is a window of 1280 px at 200 % zoom', () => {
  test.use({ viewport: { width: 640, height: 360 } })

  test('is not cut: it keeps its width, scrolls as a whole and reaches Done', async ({ page }) => {
    await page.goto(`/documents/${interviews.id}/share`)
    const dialog = dialogOf(page)
    await expect(dialog.getByRole('list')).toBeVisible()
    await addGuestRows(dialog, 15)

    const box = await dialog.boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(640)
    // Nothing of the dialog is wider than the dialog: no horizontal scroll, and no control that goes past its edge.
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    const edge = (box?.x ?? 0) + (box?.width ?? 0)
    for (const control of await dialog.getByRole('combobox').all()) {
      const controlBox = await control.boundingBox()
      expect((controlBox?.x ?? 0) + (controlBox?.width ?? 0)).toBeLessThanOrEqual(edge)
    }
    // The window is shorter than the dialog, so the dialog scrolls, and Done is where it ends.
    expect(await dialog.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    await dialog.getByRole('button', { name: 'Done' }).scrollIntoViewIfNeeded()
    await expect(dialog.getByRole('button', { name: 'Done' })).toBeInViewport({ ratio: 1 })
  })
})
