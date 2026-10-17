import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import type { DataSource } from '../../data/DataSource.ts'
import { TransportError } from '../../data/errors.ts'
import { queryKeys, type ListFilters } from '../../data/queryKeys.ts'

/**
 * Only a request that did not reach the server is tried again, once: an answer of the contract is the server's word,
 * and waiting through retries would delay the screen that says so, where the person can retry on their own.
 */
export const retryTransportOnce = (failures: number, error: Error) => error instanceof TransportError && failures < 1

/** The workspaces of the signed-in person, ordered by name. */
export const workspacesQuery = (dataSource: DataSource) =>
  queryOptions({
    queryKey: queryKeys.workspaces(),
    queryFn: () => dataSource.listWorkspaces(),
    retry: retryTransportOnce,
  })

/** Everyone who belongs to the workspace, the members who have not signed up yet included (their `name` is `null`). */
export const membersQuery = (dataSource: DataSource, workspaceId: string) =>
  queryOptions({
    queryKey: queryKeys.members(workspaceId),
    queryFn: () => dataSource.listMembers({ params: { path: { workspaceId } } }),
    retry: retryTransportOnce,
  })

export const foldersQuery = (dataSource: DataSource, workspaceId: string) =>
  queryOptions({
    queryKey: queryKeys.folders(workspaceId),
    queryFn: () => dataSource.listFolders({ params: { path: { workspaceId } } }),
    retry: retryTransportOnce,
  })

/** Filters without the cursor: the key names the list, and the cursor is the page of it, so one list is one cache entry. */
type DocumentFilters = Omit<ListFilters, 'cursor'>

/** A list of documents, a page at a time, in the order the contract fixes (`updatedAt` descending). */
export const documentListQuery = (dataSource: DataSource, workspaceId: string, filters: DocumentFilters = {}) =>
  infiniteQueryOptions({
    queryKey: queryKeys.documentList(workspaceId, filters),
    queryFn: ({ pageParam }) =>
      dataSource.listDocuments({
        params: {
          path: { workspaceId },
          query: { ...filters, ...(pageParam === undefined ? {} : { cursor: pageParam }) },
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: retryTransportOnce,
  })
