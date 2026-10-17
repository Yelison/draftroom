/* The simulated collaboration of the static demo: documents that open with their text, tabs that share them and a person who writes. */
import type { Page } from '@playwright/test'
import { launchPlan, weeklyEnglish } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' })

const editor = (page: Page) => page.getByRole('textbox', { name: /Document content|Contenido del documento/ })
const people = (page: Page) => page.getByRole('list', { name: /People in this document|Personas en este documento/ })
/** The avatar of a person in the document, which says their name and that they are online. */
const person = (page: Page, name: string) => people(page).getByLabel(new RegExp(`^${name},`))

const languages = [
  {
    name: 'English',
    locale: 'en-US',
    highlights: 'Highlights',
    openPoints: 'Still open after the pricing review:',
    collaborator: 'Daniel Okafor',
  },
  {
    name: 'Spanish',
    locale: 'es-ES',
    highlights: 'Lo más destacado',
    openPoints: 'Sigue abierto tras la revisión de precios:',
    collaborator: 'Daniel Okafor',
  },
]

for (const { name, locale, highlights, openPoints, collaborator } of languages) {
  test.describe(`in ${name}`, () => {
    test.use({ locale })

    test('a document opens with its text in the language the demo started in', async ({ page }) => {
      await page.goto(`documents/${weeklyEnglish.id}`)

      await expect(editor(page).getByRole('heading', { level: 2, name: highlights })).toBeVisible()
    })

    test('two tabs of the browser share a document and converge', async ({ page, context }) => {
      await page.goto(`documents/${weeklyEnglish.id}`)
      await expect(editor(page)).toContainText(highlights)
      const other = await context.newPage()
      await other.goto(`documents/${weeklyEnglish.id}`)
      // What the second tab shows came from the first: the document was not written twice.
      await expect(editor(other).getByRole('heading', { level: 2, name: highlights })).toHaveCount(1)

      await editor(page).click()
      await page.keyboard.press('Control+End')
      await page.keyboard.type(' A line from the first tab.')
      await expect(editor(other)).toContainText('A line from the first tab.')

      await editor(other).click()
      await other.keyboard.press('Control+End')
      await other.keyboard.type(' And an answer from the second.')
      await expect(editor(page)).toContainText('And an answer from the second.')
      await expect(editor(page).getByRole('heading', { level: 2, name: highlights })).toHaveCount(1)
    })

    test('a person is in the launch plan and writes in it', async ({ page }) => {
      await page.goto(`documents/${launchPlan.id}`)

      await expect(person(page, collaborator)).toBeVisible({ timeout: 20_000 })
      await expect(editor(page)).toContainText(new RegExp(`${openPoints} \\S`), { timeout: 40_000 })
    })
  })
}

test.describe('with less motion', () => {
  test.use({ locale: 'en-US', reducedMotion: 'reduce' })

  test('the person is in the document and writes nothing', async ({ page }) => {
    await page.goto(`documents/${launchPlan.id}`)
    await expect(person(page, 'Daniel Okafor')).toBeVisible({ timeout: 20_000 })

    // Longer than she waits before she starts, and than it takes her to write a few words.
    await page.waitForTimeout(8_000)

    await expect(editor(page)).toContainText('Still open after the pricing review:')
    await expect(editor(page)).not.toContainText(/Still open after the pricing review: \S/)
  })
})
