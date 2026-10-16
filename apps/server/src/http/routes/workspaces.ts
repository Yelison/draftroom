import type { Schema } from '@draftroom/contract'
import type { FastifyPluginCallback } from 'fastify'
import { workspacesOf } from '../../db/workspaces.ts'
import { principalOf } from '../auth/authenticate.ts'
import { authoriseWorkspace } from '../authorise.ts'
import { operationRoute } from '../operation-route.ts'
import { ProblemError } from '../problem.ts'
import { presentWorkspace } from '../presenters.ts'
import type { RouteDependencies } from './dependencies.ts'

export const workspaceRoutes: FastifyPluginCallback<RouteDependencies> = (app, { contract, database }, done) => {
  app.route(
    operationRoute(contract, 'getMe', async (request): Promise<Schema<'User'>> => {
      const person = await database
        .selectFrom('users')
        .select(['id', 'email', 'name'])
        .where('id', '=', principalOf(request).userId)
        .executeTakeFirst()
      // The session belongs to a person who signed up, and signing up gives a name: anything else is a broken session.
      if (person?.name == null) throw new ProblemError('unauthenticated')
      return { id: person.id, email: person.email, name: person.name }
    }),
  )

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

  done()
}
