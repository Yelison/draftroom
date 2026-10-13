import type { DataSource } from '../../DataSource.ts'
import { caller, requireWorkspaceOwner, workspaceOf, type Context } from '../guards.ts'
import { textLimits } from '../limits.ts'
import { sortRows } from '../pagination.ts'
import { checkTexts } from '../text.ts'
import { workspaceView } from '../views.ts'

type WorkspaceOperations = Pick<DataSource, 'listWorkspaces' | 'getWorkspace' | 'updateWorkspace'>

export function workspaceOperations(ctx: Context): WorkspaceOperations {
  const { world } = ctx

  return {
    listWorkspaces: async () => {
      const user = caller(ctx)
      const mine = world.memberships.filter((row) => row.userId === user.id)
      const workspaces = world.workspaces.flatMap((workspace) => {
        const membership = mine.find((row) => row.workspaceId === workspace.id)
        return membership === undefined ? [] : [workspaceView(workspace, membership.role)]
      })
      return { items: sortRows(workspaces, { key: (row) => row.name, id: (row) => row.id, direction: 'asc' }) }
    },

    getWorkspace: async ({ params: { path } }) => {
      const { workspace, role } = workspaceOf(ctx, path.workspaceId)
      return workspaceView(workspace, role)
    },

    updateWorkspace: async ({ params: { path }, body }) => {
      caller(ctx)
      checkTexts(['/name', body.name, textLimits.workspaceName])
      const { workspace, role } = workspaceOf(ctx, path.workspaceId)
      requireWorkspaceOwner(role)
      workspace.name = body.name
      return workspaceView(workspace, role)
    },
  }
}
