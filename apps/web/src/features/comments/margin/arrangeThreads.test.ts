import type { Schema } from '@draftroom/contract'
import { describe, expect, it } from 'vitest'
import type { Placement } from '../highlightPlugin.ts'
import { arrangeThreads } from './arrangeThreads.ts'

const person = { id: 'u1', name: 'Priya Raman' }

const thread = (id: string, status: Schema<'ThreadStatus'> = 'open', createdAt = '2026-10-17T09:00:00.000Z') =>
  ({
    id,
    documentId: 'd1',
    status,
    anchor: { start: '', end: '' },
    quote: id,
    createdBy: person,
    createdAt,
    resolvedAt: null,
    resolvedBy: null,
    comments: [],
  }) satisfies Schema<'Thread'>

const placed = (from: number): Placement => ({ status: 'placed', from, to: from + 3 })
const orphaned: Placement = { status: 'orphaned' }

const arrange = (
  threads: Schema<'Thread'>[],
  placements: Record<string, Placement>,
  filter: 'open' | 'resolved' | 'all' = 'open',
) => {
  const {
    placed: onText,
    orphaned: gone,
    waiting,
  } = arrangeThreads({
    threads,
    placements: new Map(Object.entries(placements)),
    filter,
  })
  return {
    onText: onText.map(({ thread: { id }, from }) => [id, from]),
    gone: gone.map(({ id }) => id),
    waiting: waiting.map(({ id }) => id),
  }
}

describe('arranging the threads of the margin', () => {
  it('lists the threads on the text in the order of the text, whatever the order they were made in', () => {
    const result = arrange([thread('late'), thread('early'), thread('middle')], {
      late: placed(90),
      early: placed(4),
      middle: placed(40),
    })

    expect(result.onText).toEqual([
      ['early', 4],
      ['middle', 40],
      ['late', 90],
    ])
  })

  it('keeps the order they were made in for threads at the same place', () => {
    const result = arrange(
      [thread('second', 'open', '2026-10-17T10:00:00.000Z'), thread('first', 'open', '2026-10-17T09:00:00.000Z')],
      { first: placed(10), second: placed(10) },
    )

    expect(result.onText.map(([id]) => id)).toEqual(['first', 'second'])
  })

  it('puts the threads whose text is gone apart, to be listed at the end', () => {
    const result = arrange([thread('a'), thread('gone'), thread('b')], { a: placed(5), gone: orphaned, b: placed(50) })

    expect(result.onText.map(([id]) => id)).toEqual(['a', 'b'])
    expect(result.gone).toEqual(['gone'])
  })

  it('keeps apart the threads that are not placed yet, which are not orphans: a document that is loading has none', () => {
    const result = arrange([thread('a'), thread('b')], { a: { status: 'unresolved' } })

    expect(result.waiting).toEqual(['a', 'b'])
    expect(result.gone).toEqual([])
  })

  describe('under a filter', () => {
    const threads = [thread('open-one'), thread('resolved-one', 'resolved'), thread('open-two')]
    const placements = { 'open-one': placed(1), 'resolved-one': placed(20), 'open-two': placed(40) }

    it.each([
      ['open', ['open-one', 'open-two']],
      ['resolved', ['resolved-one']],
      ['all', ['open-one', 'resolved-one', 'open-two']],
    ] as const)('%s shows %j', (filter, ids) => {
      expect(arrange(threads, placements, filter).onText.map(([id]) => id)).toEqual(ids)
    })

    it('hides the orphans that the filter hides', () => {
      const result = arrange([thread('gone', 'resolved')], { gone: orphaned }, 'open')

      expect(result.gone).toEqual([])
    })
  })
})
