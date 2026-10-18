import { isInterleavingOf } from '../src/features/editor/testing/interleaving.ts'
import { storedText } from './database.ts'
import { expect, test } from './fixtures.ts'
import { createDocument } from './scene.ts'

const danielText = 'Before then, the kit is the plan.'
const priyaText = 'Decision: we ship on Friday.'

test.describe('two people who start typing in the same new paragraph at the same moment', () => {
  test('keep every letter they typed, once, and see and store the same', async ({ join }) => {
    const documentId = await createDocument('daniel', ['priya'])
    const daniel = await join('daniel')
    const priya = await join('priya')
    await Promise.all([daniel.open(documentId), priya.open(documentId)])
    // The paragraph is made by Daniel pressing Enter, and Priya has it before either types in it.
    await daniel.editor.click()
    await daniel.page.keyboard.press('Enter')
    await expect.poll(() => priya.text()).toBe('\n')

    await Promise.all([daniel.typeAtEnd(danielText), priya.typeAtEnd(priyaText)])

    for (const person of [daniel, priya]) await expect(person.syncStatus).toHaveText('Sync status: Synced')
    await expect
      .poll(async () => (await daniel.text()) === (await priya.text()), { message: 'both show the same text' })
      .toBe(true)
    const merged = await daniel.text()
    const [empty, typed] = merged.split('\n')
    expect(empty).toBe('')
    // Their words may follow each other or be one inside the other, since both wrote at the same point; what cannot be
    // is a letter that was typed once and is there twice, or one that is gone.
    expect(isInterleavingOf(typed ?? '', danielText, priyaText)).toBe(true)
    await expect.poll(() => storedText(documentId)).toBe(merged)
  })
})
