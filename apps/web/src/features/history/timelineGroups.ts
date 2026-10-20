import { entryEvent, type TimelineEntry } from './renameBursts.ts'

export interface TimelineDay {
  /** The civil date in the person's time zone, `2026-10-13`. */
  key: string
  /** That date as the midnight of it in UTC, to be written with `timeZone: 'UTC'` so it is not moved to another day. */
  date: Date
  entries: TimelineEntry[]
}

export interface TimelineWeek {
  /** The civil date of the first day of the week, `2026-10-12`. */
  key: string
  /** The first day of the week, as `TimelineDay.date` is. */
  start: Date
  days: TimelineDay[]
}

export interface CalendarOptions {
  /** The IANA zone the person is in: the day an event is told at is the day it was there. */
  timeZone: string
  /** The first day of the week, as `Intl` numbers it: 1 is Monday and 7 is Sunday. */
  firstDay: number
}

const dayInMilliseconds = 24 * 60 * 60 * 1000

/** The day of an instant in `timeZone`, as a count of days since 1970 that does not depend on any zone. */
function dayNumber(instant: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(new Date(instant))
    .reduce<Record<string, number>>((fields, { type, value }) => ({ ...fields, [type]: Number(value) }), {})
  return Date.UTC(parts.year ?? 1970, (parts.month ?? 1) - 1, parts.day ?? 1) / dayInMilliseconds
}

const dateOfDay = (day: number): Date => new Date(day * dayInMilliseconds)

const keyOf = (day: number): string => dateOfDay(day).toISOString().slice(0, 10)

/** The first day of the week that `day` is in. January 1st 1970 was a Thursday, the 4th day of a week of Monday. */
function weekStart(day: number, firstDay: number): number {
  const weekday = ((((day + 3) % 7) + 7) % 7) + 1
  return day - ((weekday - firstDay + 7) % 7)
}

/**
 * Groups the entries, newest first, by week and, inside it, by day, in the person's time zone and with the week starting
 * on the day their language says. An entry belongs to the day of its newest event. The order of the entries is kept.
 */
export function groupByWeekAndDay(entries: readonly TimelineEntry[], { timeZone, firstDay }: CalendarOptions) {
  const weeks: TimelineWeek[] = []
  for (const entry of entries) {
    const day = dayNumber(entryEvent(entry).createdAt, timeZone)
    const start = weekStart(day, firstDay)
    const weekKey = keyOf(start)
    const dayKey = keyOf(day)

    let week = weeks.at(-1)
    if (week?.key !== weekKey) {
      week = { key: weekKey, start: dateOfDay(start), days: [] }
      weeks.push(week)
    }
    let timelineDay = week.days.at(-1)
    if (timelineDay?.key !== dayKey) {
      timelineDay = { key: dayKey, date: dateOfDay(day), entries: [] }
      week.days.push(timelineDay)
    }
    timelineDay.entries.push(entry)
  }
  return weeks
}

/** What the platform adds to `Intl.Locale`: a method in the newer engines, a property in the older ones. */
interface LocaleWithWeekInfo extends Intl.Locale {
  getWeekInfo?: () => { firstDay: number }
  weekInfo?: { firstDay: number }
}

/** The first day of the week in a language: Monday where the platform does not say, which is the rule in most of the world. */
export function firstDayOfWeek(locale: string): number {
  const info: LocaleWithWeekInfo = new Intl.Locale(locale)
  return info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay ?? 1
}
