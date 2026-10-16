import { contractLimits } from '@draftroom/contract'
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import type { DataSource, RequestOf } from '../../data/DataSource.ts'
import { queryKeys } from '../../data/queryKeys.ts'
import { documentListQuery, retryTransportOnce } from '../documents/queries.ts'

/** The filters of the history of a workspace, as `listWorkspaceActivity` names them; the cursor is the page of the list. */
export type ActivityFilters = Pick<
  NonNullable<NonNullable<RequestOf<'listWorkspaceActivity'>['params']['query']>>,
  'documentId' | 'actorId' | 'from'
>

/**
 * The history of a workspace, a page at a time, newest first. It sits under the key the data layer marks stale when a
 * document changes, so a change shows up here without a reload; the filters tell one list from another.
 */
export const workspaceActivityQuery = (dataSource: DataSource, workspaceId: string, filters: ActivityFilters) =>
  infiniteQueryOptions({
    queryKey: [...queryKeys.workspaceActivity(workspaceId), filters],
    queryFn: ({ pageParam }) =>
      dataSource.listWorkspaceActivity({
        params: {
          path: { workspaceId },
          query: { ...filters, ...(pageParam === undefined ? {} : { cursor: pageParam }) },
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: retryTransportOnce,
  })

/** The activity of one document, a page at a time, newest first. */
export const documentActivityQuery = (dataSource: DataSource, documentId: string) =>
  infiniteQueryOptions({
    queryKey: queryKeys.documentActivity(documentId),
    queryFn: ({ pageParam }) =>
      dataSource.listDocumentActivity({
        params: {
          path: { documentId },
          query: pageParam === undefined ? {} : { cursor: pageParam },
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: retryTransportOnce,
  })

/**
 * The documents the person can pick to narrow the history to, the ones changed most recently first. It is the list the
 * explorer of the editor keeps under the same key (`limit` the contract's largest page), so it is read the way the
 * explorer reads it, an infinite query whose first page is what is wanted: an entry of another shape under that key
 * would be read by the explorer as pages it does not have.
 */
export const documentOptionsQuery = (dataSource: DataSource, workspaceId: string) =>
  documentListQuery(dataSource, workspaceId, { limit: contractLimits.page.maxSize })

/** The people who can have acted: the members who have signed up. */
export const peopleOptionsQuery = (dataSource: DataSource, workspaceId: string) =>
  queryOptions({
    queryKey: queryKeys.members(workspaceId),
    queryFn: () => dataSource.listMembers({ params: { path: { workspaceId } } }),
    retry: retryTransportOnce,
  })
