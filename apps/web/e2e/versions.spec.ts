/* The version history in the production build, with a real browser: from the editor, to a version, to a restore, and back, by keyboard. */
import type { Page } from '@playwright/test'
import { versions } from '../src/data/mock/fixtures/collaboration.ts'
import { launchPlan } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

// The name a version has for a screen reader carries the moment it was made, in the browser's time zone, which is this machine's.
const named = versions.find((version) => version.documentId === launchPlan.id && version.label !== null)
const namedWhen = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
  new Date(named?.createdAt ?? 0),
)
const namedName = `Before the pricing review, ${namedWhen}`

const list = (page: Page) => page.getByRole('region', { name: 'Versions' })
const reader = (page: Page) => page.getByRole('region', { name: 'Version', exact: true })
const toggle = (page: Page) => list(page).getByRole('button', { name: 'Show automatic versions' })

test.describe('the version history', () => {
  test('is opened from the editor, an automatic version is shown and read, restored with a confirmation, all by keyboard', async ({
    page,
  }) => {
    await page.goto(`/documents/${launchPlan.id}`)
    const link = page.getByRole('button', { name: 'Version history' })
    await expect(link).toBeVisible()
    await link.focus()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(new RegExp(`/documents/${launchPlan.id}/versions$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Version history' })).toBeFocused()
    // The automatic versions wait behind the switch: only the one a person saved is listed, and it is the one that is read.
    await expect(list(page).getByRole('listitem')).toHaveCount(1)
    await expect(reader(page).getByText('Nothing you do here changes the document.')).toBeVisible()

    await toggle(page).focus()
    await page.keyboard.press('Enter')
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(list(page).getByRole('listitem')).toHaveCount(3)

    // Read the oldest one, which is an automatic one.
    const oldest = list(page).getByRole('listitem').last().getByRole('button')
    await oldest.focus()
    await page.keyboard.press('Enter')
    await expect(oldest).toHaveAttribute('aria-current', 'true')
    await expect(oldest).toBeFocused()
    const text = reader(page).getByRole('region', { name: /^Text of “Automatic version from / })
    await expect(text.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
    await expect(text).toContainText('The launch is planned for the first week of November')

    // Restore it: the dialog opens, the way out has the focus, and when it closes the focus is back on the button.
    const restore = reader(page).getByRole('button', { name: 'Restore this version' })
    await restore.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: /^Restore “Automatic version from .*”\?$/ })
    await expect(dialog).toContainText('How it is now is saved first as a version')
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Restore' })).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(dialog).toBeHidden()
    await expect(restore).toBeFocused()
    await expect(page.getByText(/The document went back to “Automatic version from /)).toBeAttached()
    await expect(list(page).getByRole('listitem')).toHaveCount(5)
    await expect(list(page).getByRole('listitem').first()).toContainText('Restored version')
    await expect(list(page).getByRole('listitem').nth(1)).toContainText('Version before a restore')
    // What was read is still read, and still marked.
    await expect(oldest).toHaveAttribute('aria-current', 'true')

    // Back to the document.
    const back = page.getByRole('link', { name: 'Back to the document “Autumn launch plan”' })
    await back.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/documents/${launchPlan.id}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Autumn launch plan' })).toBeFocused()
  })

  test('saves a version with a name, with the keyboard, and the focus comes back to the button', async ({ page }) => {
    await page.goto(`/documents/${launchPlan.id}/versions`)
    await expect(list(page).getByRole('listitem')).toHaveCount(1)
    const save = page.getByRole('button', { name: 'Save a version' })
    await save.focus()
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog', { name: 'Save a version' })
    await dialog.getByRole('textbox', { name: 'Name (optional)' }).fill('Ready for review')
    await page.keyboard.press('Enter')

    await expect(dialog).toBeHidden()
    await expect(save).toBeFocused()
    await expect(list(page).getByRole('listitem').first()).toContainText('Ready for review')
  })

  test('has no explorer, which the editor has', async ({ page }) => {
    await page.goto(`/documents/${launchPlan.id}/versions`)
    await expect(list(page).getByRole('listitem')).toHaveCount(1)
    await expect(page.getByRole('complementary', { name: 'Explorer' })).toHaveCount(0)

    await page.goto(`/documents/${launchPlan.id}`)
    await expect(page.getByRole('complementary', { name: 'Explorer' })).toBeVisible()
  })
})

/** The sum of the layout shifts the page has had since it loaded, which the browser measures. */
const shifts = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0
        const observer = new PerformanceObserver((entries) => {
          for (const entry of entries.getEntries()) {
            const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean }
            if (!shift.hadRecentInput) total += shift.value
          }
        })
        observer.observe({ type: 'layout-shift', buffered: true })
        setTimeout(() => resolve(total), 500)
      }),
  )

/** The box of an element as the page lays it out, to compare what the skeleton took with what replaced it. */
interface Box {
  x: number
  y: number
  width: number
  height: number
}
interface Geometry {
  header: Box
  list: Box
  reader: Box
}
type Seen = { skeleton?: Geometry }

const geometryOf = (page: Page) =>
  page.evaluate((): Geometry => {
    const box = (element: Element | null): Box => {
      const { x, y, width, height } = (element ?? document.body).getBoundingClientRect()
      return { x, y, width, height }
    }
    return {
      header: box(document.querySelector('main header')),
      list: box(document.querySelector('main section[aria-labelledby]')),
      reader: box(document.querySelector('main section[aria-label="Version"]')),
    }
  })

test.describe('the layout', () => {
  for (const width of [1440, 1280]) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 900 } })

      test('has no horizontal scroll with the automatic versions shown and one of them open', async ({ page }) => {
        await page.goto(`/documents/${launchPlan.id}/versions`)
        await toggle(page).click()
        await list(page).getByRole('listitem').first().getByRole('button').click()
        await expect(page.locator('.ProseMirror[contenteditable="false"]')).toContainText('Marketing prepares')

        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      })

      test('does not shift while the screen, the document and the versions arrive', async ({ page }) => {
        // The mock answers at once, so the placeholder would never be on screen to be measured: the code of the screen is
        // held back for a moment, which is what a slow connection does to it.
        await page.route('**/assets/VersionsScreen-*.js', async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 400))
          await route.continue()
        })
        await page.goto(`/documents/${launchPlan.id}/versions`)
        await expect(list(page).getByRole('listitem')).toHaveCount(1)
        await expect(reader(page).getByText(/^You are reading the version of /)).toBeVisible()

        // The screen is small, so a block that jumps scores little: what is measured is none at all, not the editor's one in a hundred.
        expect(await shifts(page)).toBeLessThan(0.001)
      })
    })
  }

  for (const [width, height] of [
    [1280, 800],
    [640, 360],
  ] as const) {
    test(`gives the list and the reader the box of their skeletons at ${width} px, so nothing moves`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await page.route('**/assets/VersionsScreen-*.js', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 400))
        await route.continue()
      })
      // The skeleton is on screen for a moment only: its boxes are taken as it appears, before the real ones replace it.
      await page.addInitScript(() => {
        const seen = window as unknown as Seen
        new MutationObserver(() => {
          const list = document.querySelector('main section[aria-labelledby] [aria-busy="true"]')
          const reader = document.querySelector('main section[aria-label="Version"] [aria-busy="true"]')
          if (list === null || reader === null || seen.skeleton !== undefined) return
          const box = (element: Element | null) => {
            const { x, y, width, height } = (element ?? document.body).getBoundingClientRect()
            return { x, y, width, height }
          }
          seen.skeleton = {
            header: box(document.querySelector('main header')),
            list: box(list.closest('section')),
            reader: box(reader.closest('section')),
          }
        }).observe(document, { childList: true, subtree: true })
      })
      await page.goto(`/documents/${launchPlan.id}/versions`)
      await expect(reader(page).getByText(/^You are reading the version of /)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Save a version' })).toBeVisible()

      const skeleton = await page.evaluate(() => (window as unknown as Seen).skeleton)
      expect(skeleton, 'the skeleton was seen').toBeDefined()
      const loaded = await geometryOf(page)
      for (const part of ['header', 'list', 'reader'] as const) {
        for (const side of ['x', 'y', 'width', 'height'] as const) {
          expect(loaded[part][side], `${part} ${side}`).toBeCloseTo(skeleton?.[part][side] ?? NaN, 0)
        }
      }
    })
  }

  test('cuts nothing and has no sideways scroll in a window of 640 × 360, which is the page zoomed to 200 %', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 360 })
    await page.goto(`/documents/${launchPlan.id}/versions`)
    await expect(reader(page).getByRole('button', { name: 'Restore this version' })).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    // A box whose content is wider than it is has something cut off or sticking out.
    const cut = await page
      .getByRole('main')
      .evaluate((root) =>
        [...root.querySelectorAll<HTMLElement>('*')]
          .filter(
            (element) =>
              element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).display !== 'inline',
          )
          .map((element) => element.textContent?.slice(0, 40)),
      )
    expect(cut).toEqual([])
    // The panels give way: the list is above the reader, and the button that restores is whole inside the window.
    const [listBox, readerBox, restoreBox] = await Promise.all([
      list(page).boundingBox(),
      reader(page).boundingBox(),
      reader(page).getByRole('button', { name: 'Restore this version' }).boundingBox(),
    ])
    expect((listBox?.y ?? 0) + (listBox?.height ?? 0)).toBeLessThanOrEqual(readerBox?.y ?? 0)
    expect((restoreBox?.x ?? 0) + (restoreBox?.width ?? 0)).toBeLessThanOrEqual(640)
  })
})

const looks = [
  { name: 'English, light', locale: 'en-US', colorScheme: 'light' },
  { name: 'Spanish, dark', locale: 'es-ES', colorScheme: 'dark' },
] as const

for (const { name, locale, colorScheme } of looks) {
  test.describe(name, () => {
    test.use({ locale, colorScheme })

    test('has no horizontal scroll at 1280 and 1440 px', async ({ page }) => {
      for (const width of [1280, 1440]) {
        await page.setViewportSize({ width, height: 800 })
        await page.goto(`/documents/${launchPlan.id}/versions`)
        await expect(
          page.getByRole('button', { name: /^(Restore this version|Restaurar esta versión)$/ }),
        ).toBeVisible()

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow, `${width}px`).toBeLessThanOrEqual(0)
      }
    })
  })
}

test.describe('the header of the history with a title of 200 characters', () => {
  for (const locale of ['en-US', 'es-ES'] as const) {
    test.describe(`in ${locale} at 1280 px`, () => {
      test.use({ locale, viewport: { width: 1280, height: 900 } })

      test('keeps its buttons whole and inside the page, and names the document only in the accessible name', async ({
        page,
      }) => {
        const title = 'Un título larguísimo '.repeat(10).slice(0, 200)
        await page.goto(`/documents/${launchPlan.id}`)
        const field = page.getByRole('textbox', { name: /Document title|Título del documento/ })
        await field.fill(title)
        await field.press('Enter')
        await page.getByRole('button', { name: /Version history|Historial de versiones/ }).click()

        const back = page.getByRole('link', {
          name: new RegExp(`^(Back to the document|Volver al documento) .${title.slice(0, 20)}`),
        })
        await expect(back).toBeVisible()
        await expect(back).toHaveText(/^(Back to the document|Volver al documento)$/)
        const save = page.getByRole('button', { name: /Save a version|Guardar una versión/ })
        for (const box of [await back.boundingBox(), await save.boundingBox()]) {
          expect(box).not.toBeNull()
          expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1280)
          expect(box?.height).toBeLessThanOrEqual(48)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      })
    })
  }
})
