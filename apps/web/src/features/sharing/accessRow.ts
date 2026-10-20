/** The row of the dialog a change belongs to: where its progress is marked and where its refusal is shown. */
export type AccessRow = { kind: 'add' } | { kind: 'general' } | { kind: 'person'; userId: string }

/** A refusal, in the words of its `code`, and the row it came from. */
export interface RowProblem {
  row: AccessRow
  message: string
}

export const sameRow = (a: AccessRow | null, b: AccessRow): boolean =>
  a !== null && a.kind === b.kind && (a.kind !== 'person' || (b.kind === 'person' && a.userId === b.userId))
