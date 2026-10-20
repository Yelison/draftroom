import { useInfiniteQuery, useIsFetching, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import type { DataSource } from '../../../data/DataSource.ts'
import { queryKeys } from '../../../data/queryKeys.ts'
import { useDataSource } from '../../../data/useDataSource.ts'
import { documentListQuery } from '../queries.ts'
import { sectionPageSize } from './sectionDefaults.ts'

/** The documents a section lists: those of a folder, or those that are in none. */
export type SectionSource = { folderId: string } | { unfiled: true }

/** What a section asks the server for: its documents, a page at a time. The first page and those after it are one query. */
const filtersOf = (source: SectionSource) => ({ ...source, limit: sectionPageSize })

/**
 * The documents of one section, a page at a time. A section that is folded asks for nothing.
 *
 * The pinned documents are listed in "Pinned" and not again in their folder, so they are taken out here, in the client:
 * the server's lists know nothing of the person's pins. A page that brings only pinned documents would leave the section
 * with "Show more" and no rows, so the next page is asked for until there is a row or no more pages.
 */
export function useSectionDocuments(workspaceId: string, source: SectionSource, expanded: boolean) {
  const query = useInfiniteQuery({
    ...documentListQuery(useDataSource(), workspaceId, filtersOf(source)),
    enabled: expanded,
  })
  const documents = useMemo(
    () => query.data?.pages.flatMap((page) => page.items).filter((document) => !document.pinned) ?? [],
    [query.data],
  )
  const { hasNextPage, isFetchNextPageError, isFetchingNextPage, fetchNextPage } = query
  const needsAnotherPage = documents.length === 0 && hasNextPage && !isFetchingNextPage && !isFetchNextPageError

  useEffect(() => {
    if (needsAnotherPage) void fetchNextPage()
  }, [needsAnotherPage, fetchNextPage])

  return { query, documents, firstPageEmpty: query.data?.pages[0]?.items.length === 0 }
}

type DocumentPage = Awaited<ReturnType<DataSource['listDocuments']>>

/**
 * Whether a section is ready to be seen: it failed, or it has something to list (a document that is not pinned) or no
 * more pages to ask for. A section whose pages so far hold only pinned documents is still on its way.
 */
function isReady(data: InfiniteData<DocumentPage> | undefined) {
  if (data === undefined) return false
  const lastPage = data.pages.at(-1)
  return lastPage?.nextCursor == null || data.pages.some((page) => page.items.some((document) => !document.pinned))
}

/**
 * Whether every open folder is ready to be seen (see `isReady`) or has failed. The page shows its sections all at once
 * when they are, and not one after the other as each arrives, which would move everything under it each time. A folder
 * that is folded asks for nothing and is not waited for.
 *
 * Reading the cache does not render again by itself: the number of reads under way is what does, since a read that ends
 * is a change in what is settled.
 */
export function useFirstPagesSettled(
  workspaceId: string,
  folderIds: readonly string[],
  isExpanded: (folderId: string) => boolean,
) {
  const queryClient = useQueryClient()
  useIsFetching({ queryKey: queryKeys.documentLists(workspaceId) })

  return folderIds.every((folderId) => {
    if (!isExpanded(folderId)) return true
    const state = queryClient.getQueryState<InfiniteData<DocumentPage>>(
      queryKeys.documentList(workspaceId, filtersOf({ folderId })),
    )
    return state !== undefined && (state.status === 'error' || (state.status === 'success' && isReady(state.data)))
  })
}
