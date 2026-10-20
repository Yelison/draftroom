import { useQuery } from '@tanstack/react-query'
import { useDataSource } from '../../data/useDataSource.ts'
import { useWorkspaceId } from '../documents/useWorkspaceId.ts'
import { workspaceQuery } from '../settings/queries.ts'

/**
 * Whether the person may invite, change roles and remove, as far as the workspace the rail already read says. It is for
 * the skeleton, which has to take the room of the page before the members are there: with no answer yet it takes the
 * owner's, which is the page that has the most in it.
 */
export function useCanManage(): boolean {
  const dataSource = useDataSource()
  const workspaceId = useWorkspaceId().data
  const workspace = useQuery({ ...workspaceQuery(dataSource, workspaceId ?? ''), enabled: workspaceId !== undefined })
  return workspace.data?.role !== 'member'
}
