import { queryOptions } from '@tanstack/react-query'
import type { DataSource } from '../../data/DataSource.ts'
import { TransportError } from '../../data/errors.ts'
import { queryKeys } from '../../data/queryKeys.ts'

/**
 * The document the editor shows: its title, role and revision, never its content, which is the Yjs document's.
 *
 * Only a request that did not reach the server is tried again, once: an answer of the contract (a `404` for a document
 * that is not there or not readable, a `5xx`) is the server's word, and waiting through retries would delay the screen
 * that says so, where the person can retry on their own.
 */
export const documentQuery = (dataSource: DataSource, documentId: string) =>
  queryOptions({
    queryKey: queryKeys.document(documentId),
    queryFn: () => dataSource.getDocument({ params: { path: { documentId } } }),
    retry: (failures, error) => error instanceof TransportError && failures < 1,
  })
