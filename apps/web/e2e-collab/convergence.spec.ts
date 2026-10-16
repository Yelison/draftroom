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

  test('converge after one of them wrote without a connection and came back, with nothing lost or doubled', async ({
    join,
  }) => {
    const documentId = await createDocument('daniel', ['priya'])
    const daniel = await join('daniel')
    const priya = await join('priya')
    priya.toleratesConnectionErrors()
    await daniel.open(documentId)
    await priya.open(documentId)
    await daniel.typeAtEnd(base)
    await expect.poll(() => priya.text()).toBe(base)
    await expect(daniel.presenceOf('Priya Raman')).toBeVisible()

    await priya.context.setOffline(true)
    await expect(priya.syncStatus).toHaveText('Sync status: Offline with local copy')
    // The connection is really cut: Daniel no longer sees her in the document, so what she writes next cannot reach him.
    await expect(daniel.presenceOf('Priya Raman')).toBeHidden()
    await Promise.all([
      daniel.typeAtEnd(' Daniel adds the dates.', 15),
      priya.typeAtEnd(' Priya adds the budget, offline.', 15),
    ])
    await expect(daniel.syncStatus).toHaveText('Sync status: Synced')
    await expect.poll(() => storedText(documentId)).toContain('Daniel adds the dates.')
    expect(storedText(documentId)).not.toContain('Priya adds the budget')
    expect(await daniel.text()).not.toContain('Priya adds the budget')
    await expect(priya.syncStatus).toHaveText('Sync status: Offline with local copy')

    await priya.context.setOffline(false)

    for (const person of [daniel, priya]) await expect(person.syncStatus).toHaveText('Sync status: Synced')
    const merged = await daniel.text()
    await expect.poll(() => priya.text()).toBe(merged)
    expect(occurrences(merged, base)).toBe(1)
    expect(occurrences(merged, 'Daniel adds the dates.')).toBe(1)
    expect(occurrences(merged, 'Priya adds the budget, offline.')).toBe(1)
    await expect.poll(() => storedText(documentId)).toBe(merged)
  })
})
