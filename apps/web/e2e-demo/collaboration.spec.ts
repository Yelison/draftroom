/* The simulated collaboration of the static demo: documents that open with their text, tabs that share them and a person who writes. */
import type { Page } from '@playwright/test'
import { demoFixtures } from '../src/data/mock/fixtures/demoSeed.ts'
import { launchPlan, weeklyEnglish } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' })

/** The text as whole words, so that «Product» is not found in «Producto». */
const asWords = (text: string) =>
  new RegExp(`(?<![\\p{L}])${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u')
const main = (page: Page) => page.getByRole('main')
const editor = (page: Page) => page.getByRole('textbox', { name: /Document content|Contenido del documento/ })
const people = (page: Page) => page.getByRole('list', { name: /People in this document|Personas en este documento/ })
/** The avatar of a person in the document, which says their name and that they are online. */
const person = (page: Page, name: string) => people(page).getByLabel(new RegExp(`^${name},`))

/** What the demo shows of its world in a language: the documents, their excerpts and the folders. */
function worldTexts(locale: 'en' | 'es') {
  const { documents, folders } = demoFixtures(locale).seed
  return [...documents.flatMap(({ title, excerpt }) => [title, excerpt ?? '']), ...folders.map(({ name }) => name)]
}

const languages = [
  {
    name: 'English',
    locale: 'en-US',
    highlights: 'Highlights',
    openPoints: 'Still open after the pricing review:',
    collaborator: 'Daniel Okafor',
    language: 'en' as const,
    otherLanguage: 'es' as const,
    folder: 'Product',
  },
  {
    name: 'Spanish',
    locale: 'es-ES',
    highlights: 'Lo más destacado',
    openPoints: 'Sigue abierto tras la revisión de precios:',
    collaborator: 'Daniel Okafor',
    language: 'es' as const,
    otherLanguage: 'en' as const,
    folder: 'Producto',
  },
]

for (const { name, locale, highlights, openPoints, collaborator, language, otherLanguage, folder } of languages) {
  test.describe(`in ${name}`, () => {
    test.use({ locale })

    test('a document opens with its text in the language the demo started in', async ({ page }) => {
      await page.goto(`documents/${weeklyEnglish.id}`)

      await expect(editor(page).getByRole('heading', { level: 2, name: highlights })).toBeVisible()
    })

    test('the lists, the home screen and a document are all in the language of the demo', async ({ page }) => {
      const own = worldTexts(language)
      const foreign = worldTexts(otherLanguage).filter((text) => text !== '' && !own.includes(text))
      const { title } = demoFixtures(language).seed.documents.find(({ id }) => id === launchPlan.id) ?? { title: '' }
      const screens = [
        { path: 'documents', shows: main(page) },
        { path: '', shows: main(page) },
        { path: `documents/${launchPlan.id}`, shows: page.getByRole('complementary') },
      ]

      for (const { path, shows } of screens) {
        await page.goto(path)
        await expect(shows).toContainText(path === '' || path === 'documents' ? title : folder)
        for (const text of foreign)
          await expect(page.locator('body'), `${path}: ${text}`).not.toContainText(asWords(text))
      }
      await expect(page.getByRole('textbox', { name: /Document title|Título del documento/ })).toHaveValue(title)
      await expect(editor(page)).toContainText(openPoints)
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
