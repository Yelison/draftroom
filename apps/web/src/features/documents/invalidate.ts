import type { QueryClient } from '@tanstack/react-query'
import { keysAfterMutation, type MutationId, type Scope } from '../../data/queryKeys.ts'

/**
 * Marks stale exactly the queries the table of `docs/api/README.md` names for a mutation. Screens never pick keys by
 * hand: a query that is missing from the table is a decision for the table, not for one screen.
 */
export function invalidateAfter(queryClient: QueryClient, mutation: MutationId, scope: Scope): Promise<void[]> {
  return Promise.all(keysAfterMutation(mutation, scope).map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}
