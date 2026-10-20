import { describe, expect, it } from 'vitest'
import { activityEvent, otherActor } from './testing/activityEvent.ts'
import { designReview } from '../../data/mock/fixtures/documents.ts'
import { groupRenameBursts, renameBurstWindowMs } from './renameBursts.ts'

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 13, 12, 0) - minutes * 60_000).toISOString()
const rename = (minutes: number, overrides = {}) => activityEvent(at(minutes), overrides)
const shape = (events: Parameters<typeof groupRenameBursts>[0]) =>
  groupRenameBursts(events).map((entry) => (entry.kind === 'event' ? 1 : entry.events.length))

describe('groupRenameBursts', () => {
  const thirdDocument = { id: designReview.id, title: designReview.title }

  // Each row is a list of events, newest first, and the size of each entry it becomes: 1 an event, n a burst of n.
  it.each([
    ['one rename is not a burst', [rename(0)], [1]],
    ['two renames one after the other are one burst', [rename(0), rename(2)], [2]],
    ['three renames, whoever made them, are one burst', [rename(0), rename(1, { actor: otherActor }), rename(2)], [3]],
    [
      'another kind of event between two renames splits them',
      [rename(0), rename(1, { type: 'thread.created' }), rename(2)],
      [1, 1, 1],
    ],
    [
      'renames of another document are not folded together',
      [rename(0), rename(1, { document: thirdDocument })],
      [1, 1],
    ],
    ['renames more than the window apart are two events', [rename(0), rename(10.1)], [1, 1]],
    ['renames exactly the window apart are one burst', [rename(0), rename(renameBurstWindowMs / 60_000)], [2]],
    ['the window counts from each rename to the next, not from the first', [rename(0), rename(9), rename(18)], [3]],
    ['a gap in the middle splits a run in two', [rename(0), rename(1), rename(30), rename(31)], [2, 2]],
    [
      'other kinds of event are never folded, even in a row',
      [rename(0, { type: 'thread.created' }), rename(1, { type: 'thread.created' })],
      [1, 1],
    ],
    ['nothing gives nothing', [], []],
  ])('%s', (_name, events, expected) => {
    expect(shape(events)).toEqual(expected)
  })

  it('keeps the events of a burst newest first and names it after the newest', () => {
    const events = [rename(0), rename(1), rename(2)]
    const [entry] = groupRenameBursts(events)

    expect(entry).toMatchObject({ kind: 'burst', key: events[0]?.id, events })
  })

  it('joins a burst that two pages cut in two once the second page is in', () => {
    const firstPage = [rename(0), rename(1)]
    const secondPage = [rename(2), rename(3), rename(60)]

    expect(shape(firstPage)).toEqual([2])
    expect(shape([...firstPage, ...secondPage])).toEqual([4, 1])
    // The burst keeps its key, so what the person did with it (unfolded it) is not lost when the page arrives.
    expect(groupRenameBursts(firstPage)[0]?.key).toBe(groupRenameBursts([...firstPage, ...secondPage])[0]?.key)
  })
})
