import { queryOptions } from '@tanstack/react-query'
import type { DataSource } from '../../data/DataSource.ts'
import { queryKeys } from '../../data/queryKeys.ts'
import { retryTransportOnce } from '../documents/queries.ts'

/**
 * Every thread of a document, open and resolved, oldest first: the panel filters them, so changing the filter shows what is
 * already there and never waits for a request. Any role that can read the document can list them.
 */
export const threadsQuery = (dataSource: DataSource, documentId: string) =>
  queryOptions({
    queryKey: queryKeys.threads(documentId),
    queryFn: async () => (await dataSource.listThreads({ params: { path: { documentId } } })).items,
    retry: retryTransportOnce,
  })
