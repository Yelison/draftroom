import type { ReactNode } from 'react'
import { QueryFailure } from './QueryFailure.tsx'
import { useWorkspaceId } from './useWorkspaceId.ts'

export interface WorkspaceGateProps {
  /** What stands in for the screen while the workspace is on its way: the measures of the screen, so nothing moves. */
  loading: ReactNode
  children: (workspaceId: string) => ReactNode
}

/** Gives a screen its workspace, or the loading state and the retry for the time it has none. */
export function WorkspaceGate({ loading, children }: WorkspaceGateProps) {
  const workspace = useWorkspaceId()

  if (workspace.isPending) return loading
  if (workspace.isError || workspace.data === undefined) {
    return <QueryFailure onRetry={() => void workspace.refetch()} retrying={workspace.isFetching} />
  }
  return children(workspace.data)
}
