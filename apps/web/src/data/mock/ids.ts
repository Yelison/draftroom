const hex = (value: number, width: number) => value.toString(16).padStart(width, '0')

/**
 * A UUID that is the same on every run, for the fixtures: `kind` names the table and `index` the row, so a failure that
 * prints an id says what it was. The shape is a version-4 UUID, which is what the contract's `Id` format asks for.
 */
export const seedId = (kind: number, index: number): string => `${hex(kind, 8)}-0000-4000-8000-${hex(index, 12)}`

/** The ids of rows created after the seed. Each mock world has its own counter, so two worlds never share a sequence. */
export function createIdGenerator(): () => string {
  let next = 0
  return () => {
    next += 1
    return `ffffffff-0000-4000-8000-${hex(next, 12)}`
  }
}
