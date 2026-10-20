import { describe, expect, it } from 'vitest'
import { groupByDay } from './days.ts'
import { makeVersion } from './testing/openVersions.tsx'

const at = (createdAt: string) => makeVersion({ id: createdAt, createdAt })

describe('grouping versions by day', () => {
  it('keeps the order and starts a group when the day changes', () => {
    const days = groupByDay(
      [at('2026-10-14T20:00:00Z'), at('2026-10-14T08:00:00Z'), at('2026-10-12T08:00:00Z')],
      'UTC',
      new Date('2026-10-14T21:00:00Z'),
    )

    expect(days.map(({ key, versions }) => [key, versions.length])).toEqual([
      ['2026-10-14', 2],
      ['2026-10-12', 1],
    ])
  })

  it.each([
    { zone: 'UTC', instant: '2026-10-14T23:30:00Z', day: '2026-10-14' },
    { zone: 'Asia/Tokyo', instant: '2026-10-14T23:30:00Z', day: '2026-10-15' },
    { zone: 'America/Los_Angeles', instant: '2026-10-14T03:30:00Z', day: '2026-10-13' },
  ])('tells the day of $instant in $zone: $day', ({ zone, instant, day }) => {
    const [first] = groupByDay([at(instant)], zone, new Date(instant))

    expect(first?.key).toBe(day)
  })

  it.each([
    { instant: '2026-10-14T12:00:00Z', relative: 'today' },
    { instant: '2026-10-13T23:59:00Z', relative: 'yesterday' },
    { instant: '2026-10-12T23:59:00Z', relative: 'earlier' },
  ])('calls $instant $relative when it is the 14th at 1 am', ({ instant, relative }) => {
    const [first] = groupByDay([at(instant)], 'UTC', new Date('2026-10-14T13:00:00Z'))

    expect(first?.relative).toBe(relative)
  })

  it('counts calendar days, not hours, on the day the clocks go back', () => {
    // 00:30 on 2026-11-01 in Los Angeles, and 00:30 on the 2nd: the day between them has 25 hours.
    const [first] = groupByDay([at('2026-11-01T07:30:00Z')], 'America/Los_Angeles', new Date('2026-11-02T08:30:00Z'))

    expect(first?.relative).toBe('yesterday')
  })
})
