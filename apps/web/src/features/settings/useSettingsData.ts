import type { Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import { useDataSource } from '../../data/useDataSource.ts'
import { retryTransportOnce } from '../documents/queries.ts'
import { useWorkspaceId } from '../documents/useWorkspaceId.ts'
import { meQuery } from '../editor/meQuery.ts'
import { workspaceQuery } from './queries.ts'

export type SettingsData =
  | { status: 'loading' }
  | { status: 'failed'; retry: () => void; retrying: boolean }
  /** `workspace` is `null` for an account that belongs to none yet: there is no name to show or change. */
  | { status: 'ready'; me: Schema<'Me'>; workspace: Schema<'Workspace'> | null }

/** What the dialog reads: who is signed in and the workspace with their role in it, as one state to show. */
export function useSettingsData(): SettingsData {
  const dataSource = useDataSource()
  const me = useQuery({ ...meQuery(dataSource), retry: retryTransportOnce })
  const workspaceId = useWorkspaceId()
  const workspace = useQuery({ ...workspaceQuery(dataSource, workspaceId.data), retry: retryTransportOnce })

  const queries = [me, workspaceId, workspace]
  const failed = queries.find((query) => query.isError)
  if (failed !== undefined) {
    return {
      status: 'failed',
      retry: () => void Promise.all(queries.filter((query) => query.isError).map((query) => query.refetch())),
      retrying: queries.some((query) => query.isError && query.isFetching),
    }
  }
  if (me.data === undefined || workspaceId.isPending) return { status: 'loading' }
  if (workspaceId.data === undefined) return { status: 'ready', me: me.data, workspace: null }
  if (workspace.data === undefined) return { status: 'loading' }
  return { status: 'ready', me: me.data, workspace: workspace.data }
}
