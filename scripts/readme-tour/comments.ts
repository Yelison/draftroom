import { expect } from '@playwright/test'
import type { Person } from './session.ts'

/** What the panel of comments is called, which the tour reads from the catalogue like every other name. */
const panel = (person: Person) => person.page.getByRole('complementary', { name: person.say('comments.panel.label') })

/** The cards of the threads the person sees. */
export const threads = (person: Person) => panel(person).getByRole('article')

/**
 * Selects `phrase` in the text as a drag of the mouse would, and comments on it with the key of the editor: the form opens
 * with the focus in its field, and the comment is sent with Ctrl+Enter. The thread is on the text when its highlight shows.
 */
export async function commentOn(person: Person, phrase: string, comment: string): Promise<void> {
  const { page } = person
  await person.editor.focus()
  const found = await person.editor.evaluate((root, wanted) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(wanted) ?? -1
      if (at < 0) continue
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + wanted.length)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      return true
    }
    return false
  }, phrase)
  expect(found, `"${phrase}" is not in the text of ${person.name}'s document`).toBe(true)
  // The editor learns of the selection from an event the browser sends after the change; the next key reads what it knows.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.keyboard.press('ControlOrMeta+Alt+m')
  const field = page.getByRole('textbox', { name: person.say('comments.new.label') })
  await expect(field, 'the shortcut did not open the form for a new comment').toBeFocused()
  await page.keyboard.type(comment, { delay: 15 })
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('mark').first(), `the thread on "${phrase}" is not highlighted`).toHaveText(phrase)
}

/** Answers the first thread the person sees. */
export async function reply(person: Person, text: string): Promise<void> {
  const field = threads(person)
    .first()
    .getByRole('textbox', { name: person.say('comments.card.replyLabel') })
  await field.click()
  await person.page.keyboard.type(text, { delay: 15 })
  await person.page.keyboard.press('Control+Enter')
  await expect(threads(person).first().getByText(text)).toBeVisible()
}
