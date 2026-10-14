import { isApiError } from '../../../data/errors.ts'

/**
 * The revision the server holds, when a change was refused because it was made on an older one. The next attempt sends
 * it, so what the person typed goes through once they have seen the message, instead of being thrown away.
 */
export function revisionFromConflict(error: unknown): number | null {
  if (!isApiError(error, 'revision-conflict')) return null
  return 'current' in error.problem ? error.problem.current.revision : null
}
