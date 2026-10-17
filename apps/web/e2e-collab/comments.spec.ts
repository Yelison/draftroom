import type { Page } from '@playwright/test'
import { expect, test, type Participant } from './fixtures.ts'
import { createDocument } from './scene.ts'

/** The paragraph both people start from. The comment is on "launch plan", which is where characters 4 to 15 are. */
const base = 'The launch plan starts with the harbour.'
const commented = 'launch plan'

/**
 * What the highlights of a page cover, as text, one entry for each thread. The caret of someone else is drawn inside the
 * text and is not part of it, and it splits the highlight it is in into two elements of the same thread.
 */
async function highlighted(page: Page): Promise<string[]> {
  return page.locator('mark').evaluateAll((marks) => {
    const byThread = new Map<string, string>()
    for (const mark of marks) {
      const copy = mark.cloneNode(true) as HTMLElement
      for (const caret of copy.querySelectorAll('[class*="_caret"]')) caret.remove()
      const thread = mark.getAttribute('data-comment-thread') ?? ''
      byThread.set(thread, (byThread.get(thread) ?? '') + (copy.textContent ?? ''))
    }
    return [...byThread.values()]
  })
}

/** Puts the caret after `offset` characters of the text, with the keyboard, and types there. */
async function typeAt(person: Participant, offset: number, text: string): Promise<void> {
  await person.editor.focus()
  await person.page.keyboard.press('Control+Home')
  for (let moved = 0; moved < offset; moved++) await person.page.keyboard.press('ArrowRight')
  await person.page.keyboard.type(text)
}

/**
 * Selects `expected`, which starts after `offset` characters, with the keyboard. The keys can arrive while the editor is
 * redrawing what the other person typed, and then the selection is not the one asked for: it is read back, and made again.
 */
async function select(person: Participant, offset: number, expected: string): Promise<void> {
  const selected = () => person.page.evaluate(() => window.getSelection()?.toString() ?? '')
  for (let attempt = 0; attempt < 3; attempt++) {
    await person.editor.focus()
    await person.page.keyboard.press('Control+Home')
    for (let moved = 0; moved < offset; moved++) await person.page.keyboard.press('ArrowRight')
    for (let count = 0; count < expected.length; count++) await person.page.keyboard.press('Shift+ArrowRight')
    if ((await selected()) === expected) break
  }
  await settled(person.page, (text) => text === expected)
}

/**
 * Waits until the page has the selection it was given, and a frame more: the editor learns of a selection from an event
 * the browser sends after the keys, and the key that opens a comment reads what the editor knows.
 */
async function settled(page: Page, complete: (selected: string) => boolean): Promise<void> {
  await expect
    .poll(async () => complete((await page.evaluate(() => window.getSelection()?.toString())) ?? ''))
    .toBe(true)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

const card = (person: Participant) =>
  person.page.getByRole('complementary', { name: 'Comments and activity' }).getByRole('article')

test.describe('a comment while the other person writes around it', () => {
  test('stays on the same characters, and is orphaned when they delete them, for both of them', async ({ join }) => {
    const documentId = await createDocument('daniel', ['priya'])
    const daniel = await join('daniel')
    const priya = await join('priya')
    await daniel.open(documentId)
    await priya.open(documentId)
    await daniel.typeAtEnd(base)
    await expect.poll(() => priya.text()).toBe(base)

    // Priya comments on "launch plan", with the keyboard; Daniel sees the thread without reloading.
    await select(priya, 4, commented)
    await priya.page.keyboard.press('Control+Alt+m')
    await priya.page.keyboard.type('Is this still the name?')
    await priya.page.keyboard.press('Control+Enter')
    await expect(card(priya)).toHaveAttribute('data-state', 'open')
    await expect(card(daniel)).toHaveAttribute('data-state', 'open')
    expect(await highlighted(priya.page)).toEqual([commented])
    await expect.poll(() => highlighted(daniel.page)).toEqual([commented])

    // Daniel types before the range, at its start, inside it, at its end and after it. Each time the range covers the
    // characters it covered, for him and for her: only what is typed inside it belongs to it.
    const typing = [
      { where: 'before the range', offset: 0, typed: 'A', covers: 'launch plan' },
      { where: 'at the start of the range', offset: 5, typed: 'B', covers: 'launch plan' },
      { where: 'inside the range', offset: 12, typed: 'C', covers: 'launchC plan' },
      { where: 'at the end of the range', offset: 18, typed: 'D', covers: 'launchC plan' },
      { where: 'after the range', offset: 40, typed: 'E', covers: 'launchC plan' },
    ]
    for (const { where, offset, typed, covers } of typing) {
      await typeAt(daniel, offset, typed)
      await expect.poll(() => highlighted(daniel.page), `Daniel's highlight after typing ${where}`).toEqual([covers])
      await expect
        .poll(() => highlighted(priya.page), `Priya's highlight after Daniel typed ${where}`)
        .toEqual([covers])
    }
    for (const person of [daniel, priya]) await expect(person.syncStatus).toHaveText('Sync status: Synced')

    // Daniel deletes the whole range: the thread keeps its quote, has no highlight and can still be answered.
    await select(daniel, 6, 'launchC plan')
    await daniel.page.keyboard.press('Delete')
    for (const person of [daniel, priya]) {
      await expect(card(person)).toHaveAttribute('data-state', 'orphaned')
      await expect(card(person).getByText(commented, { exact: true })).toBeVisible()
      expect(await highlighted(person.page)).toEqual([])
    }
    await card(priya).getByRole('textbox', { name: 'Reply to this thread' }).fill('Then it is gone.')
    await card(priya).getByRole('button', { name: 'Reply' }).click()
    await expect(card(daniel).getByText('Then it is gone.')).toBeVisible()
  })
})
