import { queryOptions } from '@tanstack/react-query'
import type { DataSource } from '../../data/DataSource.ts'
import { queryKeys } from '../../data/queryKeys.ts'
import { retryTransportOnce } from '../documents/queries.ts'

/** Who has an explicit role in the document, and how the workspace as a whole can open it: owners only. */
export const accessQuery = (dataSource: DataSource, documentId: string, enabled: boolean) =>
  queryOptions({
    queryKey: queryKeys.access(documentId),
    queryFn: () => dataSource.listAccess({ params: { path: { documentId } } }),
    retry: retryTransportOnce,
    enabled,
  })

/** The people of the workspace, the ones a document can be shared with. */
export const membersQuery = (dataSource: DataSource, workspaceId: string, enabled: boolean) =>
  queryOptions({
    queryKey: queryKeys.members(workspaceId),
    queryFn: () => dataSource.listMembers({ params: { path: { workspaceId } } }),
    retry: retryTransportOnce,
    enabled,
  })
