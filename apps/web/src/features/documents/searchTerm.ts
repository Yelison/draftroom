/** The longest search the contract accepts. It has no constant of its own in `contractLimits`. */
const maxSearchLength = 200

/**
 * What to ask the server for, from what the person typed: no spaces around it, cut to the contract's length in code
 * points, and `undefined` when nothing is left, since an empty `query` is a `400` and means "no search" here.
 */
export function searchTerm(text: string): string | undefined {
  const term = [...text.trim()].slice(0, maxSearchLength).join('')
  return term === '' ? undefined : term
}
