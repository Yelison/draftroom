import { queryOptions, skipToken } from '@tanstack/react-query'
import type { DataSource } from '../../data/DataSource.ts'
import { queryKeys } from '../../data/queryKeys.ts'
import { retryTransportOnce } from '../documents/queries.ts'

/**
 * The workspace with the role the signed-in person has in it, which decides whether they can rename it. Without an id (the
 * person's workspaces are not known yet, or they have none) there is nothing to ask.
 */
export const workspaceQuery = (dataSource: DataSource, workspaceId: string | undefined) =>
  queryOptions({
    queryKey: queryKeys.workspace(workspaceId ?? ''),
    queryFn:
      workspaceId === undefined ? skipToken : () => dataSource.getWorkspace({ params: { path: { workspaceId } } }),
    retry: retryTransportOnce,
  })
