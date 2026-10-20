import { queryOptions } from '@tanstack/react-query'
import type { DataSource } from '../../data/DataSource.ts'
import { queryKeys } from '../../data/queryKeys.ts'
import { documentListQuery, retryTransportOnce } from '../documents/queries.ts'

/** How many documents "Pick up where you left off" shows. */
export const recentDocumentCount = 3

/** The documents the person pinned and can still read, most recently changed first, each with its excerpt. */
export const pinnedDocumentsQuery = (dataSource: DataSource, workspaceId: string) =>
  queryOptions({
    queryKey: queryKeys.pinned(workspaceId),
    queryFn: () => dataSource.listPinnedDocuments({ params: { path: { workspaceId } } }),
    retry: retryTransportOnce,
  })

/** The documents changed most recently: the first page of the list, which the contract orders by `updatedAt`. */
export const recentDocumentsQuery = (dataSource: DataSource, workspaceId: string) =>
  documentListQuery(dataSource, workspaceId, { limit: recentDocumentCount })

/**
 * The newest event of the workspace, or `null` where nothing has happened (a query may not answer `undefined`). It sits under the key the data layer marks stale when a document changes, with a
 * name of its own: the history keeps pages of events under the same prefix, and this is one page of one event.
 */
export const latestEventQuery = (dataSource: DataSource, workspaceId: string) =>
  queryOptions({
    queryKey: [...queryKeys.workspaceActivity(workspaceId), 'latest'] as const,
    queryFn: () =>
      dataSource
        .listWorkspaceActivity({ params: { path: { workspaceId }, query: { limit: 1 } } })
        .then((page) => page.items[0] ?? null),
    retry: retryTransportOnce,
  })
