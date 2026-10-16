import type { RequestOf } from '../../data/DataSource.ts'

type SharedQuery = NonNullable<RequestOf<'listSharedDocuments'>['params']>['query']

/** What the contract lets the list be narrowed by: the role the caller has in the document. */
export type SharedAccess = NonNullable<NonNullable<SharedQuery>['access']>

export const sharedAccesses: readonly SharedAccess[] = ['edit', 'comment', 'view']

/**
 * The filter in the address. A value the contract does not know is no filter: the screen shows everything instead of
 * asking the server for a list it would refuse.
 */
export function accessFromParam(value: string | null): SharedAccess | undefined {
  return sharedAccesses.find((access) => access === value)
}
