/*
 * Nothing leaves its place without meaning to, on every route of the list: in the pseudo-locale, whose words are longer than
 * either language's, and in a window of the width a browser zoom of 200 % leaves a desktop one.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { matrix, routes } from './routes.ts'

const appRoot = resolve(import.meta.dirname, '..')

interface Problem {
  /** What is wrong: the page scrolls sideways, an element is outside the window, or one cuts what it holds. */
  kind: 'scrolls sideways' | 'outside the window' | 'cuts its content'
  element: string
}

/**
 * What a person would see leave its place, which is not the same as what overflows: a list that scrolls on purpose, text cut
 * with an ellipsis, and the text that only a screen reader reads are meant to, and are not reported.
 */
async function problemsOf(page: Page): Promise<Problem[]> {
  return page.evaluate(() => {
    const found: { kind: 'scrolls sideways' | 'outside the window' | 'cuts its content'; element: string }[] = []
    const describe = (element: Element) => {
      const label = element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 40) ?? ''
      return `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).split(' ')[0]}` : ''} “${label}”`
    }
    const root = document.documentElement
    if (root.scrollWidth > root.clientWidth) found.push({ kind: 'scrolls sideways', element: 'the page' })

    const hidesOverflow = (value: string) => value === 'hidden' || value === 'clip'
    const scrolls = (value: string) => value === 'auto' || value === 'scroll'
    for (const element of document.body.querySelectorAll('*')) {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) continue
      if (element instanceof HTMLSelectElement || element instanceof SVGElement) continue
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      if (style.display === 'none' || style.visibility === 'hidden' || box.width === 0 || box.height === 0) continue
      // The text that is only for a screen reader is one pixel, cut on purpose.
      if (box.width <= 1 || box.height <= 1) continue

      let inside: Element | null = element.parentElement
      let scrollable = false
      while (inside !== null && inside !== document.body) {
        const ancestor = getComputedStyle(inside)
        if (scrolls(ancestor.overflowX) || hidesOverflow(ancestor.overflowX)) scrollable = true
        inside = inside.parentElement
      }
      if (!scrollable && style.position !== 'fixed' && (box.right > root.clientWidth + 1 || box.left < -1)) {
        found.push({ kind: 'outside the window', element: describe(element) })
      }

      // A clamp to some lines is how an excerpt is meant to end.
      if (style.getPropertyValue('-webkit-line-clamp') !== 'none') continue
      const cutsAcross = hidesOverflow(style.overflowX) && style.textOverflow !== 'ellipsis'
      const cutsDown = hidesOverflow(style.overflowY)
      const wider = element.scrollWidth > element.clientWidth + 1
      const taller = element.scrollHeight > element.clientHeight + 1
      if ((cutsAcross && wider) || (cutsDown && taller))
        found.push({ kind: 'cuts its content', element: describe(element) })
    }
    return found
  })
}

test.describe('in the pseudo-locale', () => {
  // The pseudo-locale is a build of its own, in a directory of the one the suite serves (docs/decisions/0003). It is made
  // here, after the build the server was started on, so that this spec needs nothing of the configuration of the suite.
  test.beforeAll(() => {
    const vite = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin/vite.js')
    execFileSync(process.execPath, [vite, 'build', '--mode', 'pseudo'], { cwd: appRoot, stdio: 'pipe' })
  })

  for (const colorScheme of matrix.themes) {
    for (const width of matrix.widths) {
      test.describe(`${colorScheme} theme, ${width} px`, () => {
        test.use({
          colorScheme,
          locale: 'en-US',
          viewport: { width, height: 900 },
          baseURL: `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 4173}/__pseudo__/`,
        })

        for (const route of routes) {
          test(`${route.name} keeps everything in its place`, async ({ page }) => {
            await route.open(page)

            // The words are the pseudo-locale's: in brackets, accented and longer. Without them this would measure the English build.
            expect(await page.locator('body').innerText()).toMatch(/\[[^\]]*[^\x00-\x7F][^\]]*\]/)
            expect(await problemsOf(page)).toEqual([])
          })
        }
      })
    }
  }
})

// A browser at 200 % zoom on a window of 1280 px is a window of 640 CSS px, and on one of 1440 px, of 720. The page lays out
// in CSS pixels, so a window of that size is what the zoom makes of it: the media queries, the widths and the reflow are the
// same.
for (const { window, zoomed } of [
  { window: 1280, zoomed: { width: 640, height: 360 } },
  { window: 1440, zoomed: { width: 720, height: 450 } },
]) {
  test.describe(`zoomed to 200 % in a window of ${window} px`, () => {
    test.use({ locale: 'en-US', colorScheme: 'light', viewport: zoomed })

    for (const route of routes) {
      test(`${route.name} stays whole and usable`, async ({ page }) => {
        await route.open(page)

        expect(await problemsOf(page)).toEqual([])
        // The notice of the narrow window does not take the place of the page: the page is there, and the notice can be closed.
        await expect(page.getByRole('main')).toBeVisible()
        // The page starts on the first screen and has most of the width: nothing is stacked above it, and the rail is the
        // compact one, not a column the page has to make room beside.
        const main = await page.getByRole('main').boundingBox()
        expect(main?.y).toBeLessThan(zoomed.height)
        expect(main?.width).toBeGreaterThanOrEqual(zoomed.width * 0.75)
        const dismiss = page.getByRole('button', { name: 'Dismiss' })
        await expect(dismiss).toBeVisible()
        // A dialog is modal, and what is behind it cannot be reached until it is closed.
        if ((await page.getByRole('dialog').count()) === 0) {
          await dismiss.click()
          await expect(dismiss).toBeHidden()
          expect(await problemsOf(page)).toEqual([])
        }
      })
    }
  })
}
