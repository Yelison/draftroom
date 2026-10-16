import { storedText } from './database.ts'
import { expect, test } from './fixtures.ts'
import { createDocument } from './scene.ts'

/** The paragraph both people start from, written by one of them and seen by the other before anyone else types. */
const base = 'The launch plan starts with the harbour.'

const occurrences = (text: string, part: string) => text.split(part).length - 1

test.describe('two people in the same paragraph', () => {
  test('converge on one text, with every insertion once, which the database also holds', async ({ join }) => {
    const documentId = await createDocument('daniel', ['priya'])
    const daniel = await join('daniel')
    const priya = await join('priya')
    await daniel.open(documentId)
    await priya.open(documentId)
    await daniel.typeAtEnd(base)
    await expect.poll(() => priya.text()).toBe(base)

    // Both write after the last character at the same time, the case in which a merge can interleave or double text.
    await Promise.all([daniel.typeAtEnd(' Daniel adds the dates.', 15), priya.typeAtEnd(' Priya adds the budget.', 15)])

    for (const person of [daniel, priya]) await expect(person.syncStatus).toHaveText('Sync status: Synced')
    const merged = await daniel.text()
    await expect.poll(() => priya.text()).toBe(merged)
    expect(occurrences(merged, base)).toBe(1)
    expect(occurrences(merged, 'Daniel adds the dates.')).toBe(1)
    expect(occurrences(merged, 'Priya adds the budget.')).toBe(1)
    await expect.poll(() => storedText(documentId)).toBe(merged)
  })
})
