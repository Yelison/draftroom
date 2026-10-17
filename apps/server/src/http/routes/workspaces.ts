import type { Schema } from '@draftroom/contract'
import type { FastifyPluginCallback } from 'fastify'
import { renameWorkspace, workspacesOf } from '../../db/workspaces.ts'
import { principalOf } from '../auth/authenticate.ts'
import { authoriseWorkspace } from '../authorise.ts'
import { operationRoute } from '../operation-route.ts'
import { presentWorkspace } from '../presenters.ts'
import type { RouteDependencies } from './dependencies.ts'

export const workspaceRoutes: FastifyPluginCallback<RouteDependencies> = (app, { contract, database }, done) => {
  app.route(
    operationRoute(contract, 'listWorkspaces', async (request): Promise<Schema<'WorkspaceList'>> => {
      const workspaces = await workspacesOf(database, principalOf(request).userId)
      return { items: workspaces.map(presentWorkspace) }
    }),
  )

  app.route(
    operationRoute(contract, 'getWorkspace', async (request): Promise<Schema<'Workspace'>> => {
      const workspace = await authoriseWorkspace(
        database,
        request.params.workspaceId,
        principalOf(request).userId,
        'workspace-read',
      )
      return presentWorkspace(workspace)
    }),
  )

  app.route(
    operationRoute(contract, 'updateWorkspace', async (request): Promise<Schema<'Workspace'>> => {
      const workspace = await authoriseWorkspace(
        database,
        request.params.workspaceId,
        principalOf(request).userId,
        'rename-workspace',
      )
      return presentWorkspace({ ...workspace, name: await renameWorkspace(database, workspace.id, request.body.name) })
    }),
  )

  done()
}
