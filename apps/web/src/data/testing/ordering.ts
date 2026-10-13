// How the contract suite judges the order of a newest-first list, apart from the suite so that it can be tested.

/**
 * An RFC 3339 UTC instant as text that sorts the way time does, whatever precision the server writes: the fraction is
 * padded to nanoseconds, because `Date.parse` keeps milliseconds and would call two instants a microsecond apart equal.
 */
export function instantKey(instant: string): string {
  const parts = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/.exec(instant)
  if (parts === null) throw new Error(`Not an RFC 3339 UTC instant: ${instant}`)
  return `${parts[1]}.${(parts[2] ?? '').padEnd(9, '0')}`
}

/** Whether rows are in the order of a newest-first list: by the whole instant, then by id. */
export function isNewestFirst(rows: readonly { instant: string; id: string }[]): boolean {
  return rows.every((row, index) => {
    const previous = rows[index - 1]
    if (previous === undefined) return true
    const [before, after] = [instantKey(previous.instant), instantKey(row.instant)]
    return before > after || (before === after && previous.id > row.id)
  })
}
