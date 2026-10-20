import { describe, expect, it } from 'vitest'
import { activityEvent } from './testing/activityEvent.ts'
import { groupRenameBursts } from './renameBursts.ts'
import { firstDayOfWeek, groupByWeekAndDay, type CalendarOptions } from './timelineGroups.ts'

const monday: CalendarOptions = { timeZone: 'UTC', firstDay: 1 }
const sunday: CalendarOptions = { timeZone: 'UTC', firstDay: 7 }

/** The weeks and days the instants fall in, as `week > day:how many events`. */
function groupsOf(instants: readonly string[], options: CalendarOptions) {
  const entries = groupRenameBursts(instants.map((instant) => activityEvent(instant, { type: 'thread.created' })))
  return groupByWeekAndDay(entries, options).map((week) => ({
    week: week.key,
    days: week.days.map((day) => `${day.key}:${day.entries.length}`),
  }))
}

describe('groupByWeekAndDay', () => {
  it('writes the day once for the events of a day and starts another when the day changes', () => {
    expect(groupsOf(['2026-10-14T18:00:00Z', '2026-10-14T09:00:00Z', '2026-10-13T23:00:00Z'], monday)).toEqual([
      { week: '2026-10-12', days: ['2026-10-14:2', '2026-10-13:1'] },
    ])
  })

  it('starts another week after a Sunday when the week starts on Monday, and after a Saturday when it starts on Sunday', () => {
    const instants = ['2026-10-12T10:00:00Z', '2026-10-11T10:00:00Z', '2026-10-10T10:00:00Z']

    expect(groupsOf(instants, monday).map(({ week }) => week)).toEqual(['2026-10-12', '2026-10-05'])
    // October 11th 2026 is a Sunday: it opens its own week, and the Saturday before it closes the one before.
    expect(groupsOf(instants, sunday).map(({ week }) => week)).toEqual(['2026-10-11', '2026-10-04'])
  })

  it.each([
    ['Pacific/Auckland', '2026-10-13T12:00:00Z', '2026-10-14'],
    ['America/Los_Angeles', '2026-10-13T05:00:00Z', '2026-10-12'],
    ['UTC', '2026-10-13T05:00:00Z', '2026-10-13'],
  ])('puts an instant on the day it is in %s', (timeZone, instant, day) => {
    expect(groupsOf([instant], { timeZone, firstDay: 1 })[0]?.days).toEqual([`${day}:1`])
  })

  it('puts a burst on the day of its newest rename', () => {
    const entries = groupRenameBursts([activityEvent('2026-10-13T00:02:00Z'), activityEvent('2026-10-12T23:58:00Z')])

    expect(groupByWeekAndDay(entries, monday)[0]?.days.map((day) => day.key)).toEqual(['2026-10-13'])
  })

  it('gives nothing for nothing', () => {
    expect(groupByWeekAndDay([], monday)).toEqual([])
  })
})

describe('firstDayOfWeek', () => {
  it.each([
    ['en-US', 7],
    ['es-ES', 1],
    ['en-GB', 1],
  ])('is the number of the first day of the week in %s', (locale, firstDay) => {
    expect(firstDayOfWeek(locale)).toBe(firstDay)
  })
})
