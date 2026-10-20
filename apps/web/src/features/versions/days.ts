import type { Schema } from '@draftroom/contract'

/** How far a day is from today, which is what decides whether it is called by name or by its date. */
export type RelativeDay = 'today' | 'yesterday' | 'earlier'

export interface VersionDay {
  /** The civil date in the person's time zone, `2026-10-13`. */
  key: string
  /** That date as the midnight of it in UTC, to be written with `timeZone: 'UTC'` so it is not moved to another day. */
  date: Date
  relative: RelativeDay
  versions: Schema<'Version'>[]
}

const dayInMilliseconds = 24 * 60 * 60 * 1000

/** The calendar day of an instant in `timeZone`, as a count of days since 1970 that does not depend on any zone. */
function dayNumber(instant: Date | string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(new Date(instant))
    .reduce<Record<string, number>>((fields, { type, value }) => ({ ...fields, [type]: Number(value) }), {})
  return Date.UTC(parts.year ?? 1970, (parts.month ?? 1) - 1, parts.day ?? 1) / dayInMilliseconds
}

/**
 * Groups the versions, which come newest first, by the day they were made in `timeZone`, keeping their order. The
 * relative day compares calendar days, not hours: a version of 11 pm is from yesterday at 1 am.
 */
export function groupByDay(versions: readonly Schema<'Version'>[], timeZone: string, now: Date): VersionDay[] {
  const today = dayNumber(now, timeZone)
  const days: VersionDay[] = []
  for (const version of versions) {
    const day = dayNumber(version.createdAt, timeZone)
    const date = new Date(day * dayInMilliseconds)
    const key = date.toISOString().slice(0, 10)
    let current = days.at(-1)
    if (current?.key !== key) {
      current = {
        key,
        date,
        relative: day === today ? 'today' : day === today - 1 ? 'yesterday' : 'earlier',
        versions: [],
      }
      days.push(current)
    }
    current.versions.push(version)
  }
  return days
}
