import { queryOptions } from '@tanstack/react-query'
import type { DataSource } from '../../data/DataSource.ts'
import { queryKeys } from '../../data/queryKeys.ts'
import { retryTransportOnce } from '../documents/queries.ts'

/** The workspace with the role the signed-in person has in it, which decides whether they can rename it. */
export const workspaceQuery = (dataSource: DataSource, workspaceId: string) =>
  queryOptions({
    queryKey: queryKeys.workspace(workspaceId),
    queryFn: () => dataSource.getWorkspace({ params: { path: { workspaceId } } }),
    retry: retryTransportOnce,
  })
