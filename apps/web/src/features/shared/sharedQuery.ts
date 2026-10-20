import { queryOptions } from '@tanstack/react-query'
import type { DataSource } from '../../data/DataSource.ts'
import { queryKeys } from '../../data/queryKeys.ts'
import { retryTransportOnce } from '../documents/queries.ts'

/**
 * The documents other people shared with the caller, newest change first, as the contract orders them. The contract has
 * no cursor for this list, so the whole list arrives at once, and each document says the role the caller has in it.
 */
export const sharedListQuery = (dataSource: DataSource, workspaceId: string) =>
  queryOptions({
    queryKey: queryKeys.shared(workspaceId),
    queryFn: () => dataSource.listSharedDocuments({ params: { path: { workspaceId } } }),
    retry: retryTransportOnce,
  })
