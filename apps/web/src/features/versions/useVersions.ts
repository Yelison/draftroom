import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useDataSource } from '../../data/useDataSource.ts'
import { versionsQuery } from './queries.ts'

/** The versions of a document, newest first and a page at a time, as one list. */
export function useVersions(documentId: string) {
  const dataSource = useDataSource()
  const query = useInfiniteQuery(versionsQuery(dataSource, documentId))
  const versions = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  return { query, versions }
}

export type VersionsQuery = ReturnType<typeof useVersions>['query']
