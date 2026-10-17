import { queryOptions } from '@tanstack/react-query'
import type { DataSource } from '../../data/DataSource.ts'
import { queryKeys } from '../../data/queryKeys.ts'
import { retryTransportOnce } from '../documents/queries.ts'

/** The documents the person pinned and can still read, most recently changed first, each with its excerpt. */
export const pinnedDocumentsQuery = (dataSource: DataSource, workspaceId: string) =>
  queryOptions({
    queryKey: queryKeys.pinned(workspaceId),
    queryFn: () => dataSource.listPinnedDocuments({ params: { path: { workspaceId } } }),
    retry: retryTransportOnce,
  })
