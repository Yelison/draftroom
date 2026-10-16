import { describe, expect, it } from 'vitest'
import { activityFilters, appliedCount, rangeStart, readFilters } from './historyFilters.ts'

const documentId = '5b8f7a3e-2d4c-4e1b-8a6f-1c9d3e7b0a11'
const actorId = '7c2e9d41-6a8b-4f03-b5d7-2e4a8c1f9b22'
const now = Date.parse('2026-10-14T10:30:00.000Z')

describe('reading the filters of the address', () => {
  it.each([
    ['nothing', '', {}],
    [
      'the three of them',
      `document=${documentId}&person=${actorId}&range=week`,
      { documentId, actorId, range: 'week' },
    ],
    ['a value that is not an id', 'document=launch-plan&person=', {}],
    ['a range that is not one', 'range=yesterday', {}],
    ['what it does not know', 'q=plan&page=2', {}],
  ])('takes %s', (_name, search, expected) => {
    expect(readFilters(new URLSearchParams(search))).toEqual(expected)
  })

  it('counts the filters that are applied', () => {
    expect(appliedCount({})).toBe(0)
    expect(appliedCount({ documentId, range: 'today' })).toBe(2)
  })
})

describe('the start of a period', () => {
  it.each([
    ['week', '2026-10-07T10:30:00.000Z'],
    ['month', '2026-09-14T10:30:00.000Z'],
  ] as const)('of the last %s counts back from now', (range, expected) => {
    expect(rangeStart(range, now)).toBe(expected)
  })

  it('of today is the start of the day the person is in, not 24 hours ago', () => {
    const start = new Date(rangeStart('today', now))

    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0])
    expect(now - start.getTime()).toBeLessThan(24 * 60 * 60 * 1000)
    expect(start.getTime()).toBeLessThanOrEqual(now)
  })
})

describe('the filters of a request', () => {
  it('turn the period into an instant and leave out what is not applied', () => {
    expect(activityFilters({ actorId, range: 'week' }, now)).toEqual({ actorId, from: '2026-10-07T10:30:00.000Z' })
    expect(activityFilters({}, now)).toEqual({})
  })
})
