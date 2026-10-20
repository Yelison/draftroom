import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useDataSource } from '../../../data/useDataSource.ts'
import { documentListQuery } from '../queries.ts'
import { sectionPageSize } from './pageSize.ts'

/** The documents a section lists: those of a folder, or those that are in none. */
export type SectionSource = { folderId: string } | { unfiled: true }

/**
 * The documents of one section, a page at a time. A section that is folded asks for nothing.
 *
 * The pinned documents are listed in "Pinned" and not again in their folder, so they are taken out here, in the client:
 * the server's lists know nothing of the person's pins. A page that brings only pinned documents would leave the section
 * with "Show more" and no rows, so the next page is asked for until there is a row or no more pages.
 */
export function useSectionDocuments(workspaceId: string, source: SectionSource, expanded: boolean) {
  const query = useInfiniteQuery({
    ...documentListQuery(useDataSource(), workspaceId, { ...source, limit: sectionPageSize }),
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
