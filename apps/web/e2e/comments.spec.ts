/*
 * Comments in the production build, with a real browser and the simulated server of the mock: commenting on a selection,
 * answering, resolving and reopening, from the keyboard alone, in both languages. What two people see of each other's
 * comments, and what happens to an anchor when the other one types around it, is proved against the real stack in
 * `e2e-collab/comments.spec.ts`.
 */
import type { Locator, Page } from '@playwright/test'
import { onboardingChecklist } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'
import { watchPolicyViolations } from './policyViolations.ts'

const documentPath = `/documents/${onboardingChecklist.id}`
const line = 'Ask your buddy anything: no question is too small.'

/** What each language calls the parts of the panel that these tests use. */
const words = {
  en: {
    locale: 'en-US',
    comment: 'Comment on the selected text',
    hint: 'Select some text to comment on it.',
    yourComment: 'Your comment',
    replyField: 'Reply to this thread',
    resolve: 'Resolve',
    reopen: 'Reopen',
    openFilter: /^Open \(/,
    resolvedFilter: /^Resolved \(/,
    announced: {
      created: 'Comment added.',
      replied: 'Reply added.',
      resolved: 'Thread resolved.',
      reopened: 'Thread reopened.',
    },
    text: 'Document content',
    panel: 'Comments and activity',
    commentsHeading: 'Comments',
  },
  es: {
    locale: 'es-ES',
    comment: 'Comentar el texto seleccionado',
    hint: 'Selecciona un texto para comentarlo.',
    yourComment: 'Tu comentario',
    replyField: 'Responder a este hilo',
    resolve: 'Resolver',
    reopen: 'Reabrir',
    openFilter: /^Abiertos \(/,
    resolvedFilter: /^Resueltos \(/,
    announced: {
      created: 'Comentario añadido.',
      replied: 'Respuesta añadida.',
      resolved: 'Hilo resuelto.',
      reopened: 'Hilo reabierto.',
    },
    text: 'Contenido del documento',
    panel: 'Comentarios y actividad',
    commentsHeading: 'Comentarios',
  },
} as const

const textArea = (page: Page, name: string) => page.getByRole('textbox', { name })
const marks = (page: Page) => page.locator('mark')
const tagWithFocus = (page: Page) => page.evaluate(() => document.activeElement?.tagName ?? 'none')

/** Puts the caret after the last character of the text, and selects the last word before the full stop. */
async function selectLastWord(page: Page, text: Locator) {
  await text.focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('ArrowLeft')
  // "small" is five letters.
  for (let index = 0; index < 5; index++) await page.keyboard.press('Shift+ArrowLeft')
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('small')
  // The editor learns of the selection from an event that the browser sends after the keys; the next key reads what it knows.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

for (const [language, said] of Object.entries(words)) {
  test.describe(`in ${language}`, () => {
    test.use({ locale: said.locale, colorScheme: 'light' })

    test('comments on a selection, answers, resolves and reopens, with the keyboard alone', async ({ page }) => {
      await page.goto(documentPath)
      const text = textArea(page, said.text)
      await text.waitFor()
      const panel = page.getByRole('complementary', { name: said.panel })
      await text.focus()
      await page.keyboard.type(line)
      await selectLastWord(page, text)

      // The key opens the form for the selection, with the focus in its field.
      await page.keyboard.press('ControlOrMeta+Alt+m')
      const field = textArea(page, said.yourComment)
      await expect(field).toBeFocused()
      await page.keyboard.type('Is that the right word?')
      await page.keyboard.press('Control+Enter')

      // The thread is on the text, announced, and the focus is on its card.
      const card = panel.getByRole('article')
      await expect(card).toBeFocused()
      await expect(card).toHaveAttribute('data-state', 'open')
      await expect(marks(page)).toHaveText('small')
      await expect(page.getByRole('status').filter({ hasText: said.announced.created })).toHaveCount(1)

      // Tab goes through the card: edit, delete, the reply field.
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await expect(textArea(page, said.replyField)).toBeFocused()
      await page.keyboard.type('Yes, small it is.')
      await page.keyboard.press('Control+Enter')
      await expect(card.getByText('Yes, small it is.')).toBeVisible()
      await expect(textArea(page, said.replyField)).toBeFocused()
      await expect(page.getByRole('status').filter({ hasText: said.announced.replied })).toHaveCount(1)

      // The reply button, then Resolve: the card leaves the open threads and the focus goes to the heading of the panel.
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Enter')
      await expect(panel.getByRole('article')).toHaveCount(0)
      await expect(marks(page)).toHaveCount(0)
      await expect(panel.getByRole('heading', { level: 2, name: said.commentsHeading })).toBeFocused()
      await expect(page.getByRole('status').filter({ hasText: said.announced.resolved })).toHaveCount(1)

      // The filter, with the keyboard: the text is still selected, so the button that comments on it comes first, then the
      // filter. The resolved thread is there, and reopening it puts its highlight back.
      await page.keyboard.press('Tab')
      await expect(panel.getByRole('button', { name: said.comment })).toBeFocused()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await expect(panel.getByRole('button', { name: said.resolvedFilter })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(panel.getByRole('button', { name: said.resolvedFilter })).toHaveAttribute('aria-pressed', 'true')
      await expect(panel.getByRole('article')).toHaveAttribute('data-state', 'resolved')
      // Past the last choice of the filter, the card: the buttons of each of its two comments, then Reopen.
      await page.keyboard.press('Tab')
      for (const [index, name] of [
        /^(Edit|Editar)/,
        /^(Delete|Eliminar)/,
        /^(Edit|Editar)/,
        /^(Delete|Eliminar)/,
      ].entries()) {
        await page.keyboard.press('Tab')
        await expect(card.getByRole('button', { name }).nth(Math.floor(index / 2))).toBeFocused()
      }
      await page.keyboard.press('Tab')
      await expect(card.getByRole('button', { name: said.reopen })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(marks(page)).toHaveText('small')
      expect(await tagWithFocus(page)).not.toBe('BODY')
      await expect(page.getByRole('status').filter({ hasText: said.announced.reopened })).toHaveCount(1)
    })

    test('goes from the text to its thread with the key, and back with Escape', async ({ page }) => {
      await page.goto(documentPath)
      const text = textArea(page, said.text)
      await text.waitFor()
      const panel = page.getByRole('complementary', { name: said.panel })
      await text.focus()
      await page.keyboard.type(line)
      await selectLastWord(page, text)
      await page.keyboard.press('ControlOrMeta+Alt+m')
      await page.keyboard.type('Back and forth')
      await page.keyboard.press('Control+Enter')
      await expect(panel.getByRole('article')).toBeFocused()

      // From the card to the text, with the highlighted word selected.
      await page.keyboard.press('Escape')
      await expect(text).toBeFocused()
      expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('small')

      // From the text to the card: the caret in the highlight is enough.
      await page.keyboard.press('ArrowLeft')
      // The panel says there is no selection once the editor has taken the caret in: only then is the key for the thread.
      await expect(panel.getByText(said.hint)).toBeVisible()
      await page.keyboard.press('ControlOrMeta+Alt+m')
      await expect(panel.getByRole('article')).toBeFocused()
      await expect(panel.getByRole('article')).toHaveAttribute('aria-current', 'true')
    })

    test('is refused nothing by the content security policy while a person comments', async ({ page }) => {
      const violations = await watchPolicyViolations(page)
      await page.goto(documentPath)
      const text = textArea(page, said.text)
      await text.waitFor()
      const panel = page.getByRole('complementary', { name: said.panel })
      await text.focus()
      await page.keyboard.type(line)
      await selectLastWord(page, text)

      // Every part of the panel that is drawn: the form, the card and its highlight, a reply, the other tab, and the filter.
      await page.keyboard.press('ControlOrMeta+Alt+m')
      await page.keyboard.type('Is that the right word?')
      await page.keyboard.press('Control+Enter')
      await expect(marks(page)).toHaveText('small')
      await panel.getByRole('textbox', { name: said.replyField }).fill('Yes.')
      await page.keyboard.press('Control+Enter')
      await expect(panel.getByRole('article').getByText('Yes.')).toBeVisible()
      await panel.getByRole('tab', { name: /^(Activity|Actividad)$/ }).click()
      await expect(panel.getByRole('heading', { level: 3 }).first()).toBeVisible()
      await panel.getByRole('tab', { name: /^(Comments|Comentarios)$/ }).click()
      await panel.getByRole('button', { name: said.resolve, exact: true }).click()
      await panel.getByRole('button', { name: said.resolvedFilter }).click()
      await expect(panel.getByRole('article')).toHaveAttribute('data-state', 'resolved')

      expect(await violations()).toEqual([])
    })

    test('keeps the layout whole at 1280 px, with no horizontal scroll', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto(documentPath)
      await textArea(page, said.text).waitFor()
      const panel = page.getByRole('complementary', { name: said.panel })
      // Below 1440 px the panel starts closed, to leave the sheet its width; here it is opened, the narrowest the layout gets.
      await expect(panel).toBeHidden()
      await page.getByRole('button', { name: /^(Comments|Comentarios)/ }).click()
      await expect(panel).toBeVisible()

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
      const box = await panel.boundingBox()
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1280)
    })
  })
}
