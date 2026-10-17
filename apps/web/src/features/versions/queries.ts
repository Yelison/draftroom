import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import type { DataSource } from '../../data/DataSource.ts'
import { queryKeys } from '../../data/queryKeys.ts'
import { retryTransportOnce } from '../documents/queries.ts'

/**
 * The versions of a document, newest first and a page at a time. They sit under the key that saving, restoring and the
 * `versions-changed` event make stale (`queryKeys.versions`), so the list follows what the table of invalidation says.
 */
export const versionsQuery = (dataSource: DataSource, documentId: string) =>
  infiniteQueryOptions({
    queryKey: queryKeys.versions(documentId),
    queryFn: ({ pageParam }) =>
      dataSource.listVersions({
        params: { path: { documentId }, query: pageParam === undefined ? {} : { cursor: pageParam } },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: retryTransportOnce,
  })

/**
 * What a version held, as the Yjs update the server stored. A version never changes, so what was downloaded is never
 * stale, and its key is outside the list's: saving, restoring or an event that makes the list stale does not make a
 * download be read again. It is kept for a minute after the preview goes away, so coming back to a version does not
 * download it again.
 */
export const versionContentQuery = (dataSource: DataSource, documentId: string, versionId: string) =>
  queryOptions({
    queryKey: ['versions', versionId, 'content'],
    queryFn: () => dataSource.getVersionContent({ params: { path: { versionId } } }),
    staleTime: Infinity,
    gcTime: 60_000,
    retry: retryTransportOnce,
  })
