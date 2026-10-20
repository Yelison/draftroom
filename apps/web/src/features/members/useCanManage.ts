import { useQuery } from '@tanstack/react-query'
import { useDataSource } from '../../data/useDataSource.ts'
import { useWorkspaceId } from '../documents/useWorkspaceId.ts'
import { workspaceQuery } from '../settings/queries.ts'

/**
 * Whether the person may invite, change roles and remove, as far as the workspace the rail already read says, and
 * `undefined` while that is not known. It is for the skeleton, which takes the room of the page before the members are
 * there: guessing the role would reserve the wrong page for half of the people.
 */
export function useCanManage(): boolean | undefined {
  const dataSource = useDataSource()
  const workspaceId = useWorkspaceId().data
  const workspace = useQuery({ ...workspaceQuery(dataSource, workspaceId ?? ''), enabled: workspaceId !== undefined })
  return workspace.data === undefined ? undefined : workspace.data.role === 'owner'
}
