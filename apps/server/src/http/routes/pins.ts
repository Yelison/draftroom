import type { DocumentRole, Schema } from '@draftroom/contract'
import type { FastifyPluginCallback } from 'fastify'
import { listPinned, listSharedCandidates, roleOf } from '../../db/documents/caller-documents.ts'
import { pinDocument, unpinDocument } from '../../db/documents/commands.ts'
import { principalOf } from '../auth/authenticate.ts'
import { authoriseDocument, authoriseWorkspace } from '../authorise.ts'
import { operationRoute } from '../operation-route.ts'
import { presentReadable } from '../presenters.ts'
import type { RouteDependencies } from './dependencies.ts'

/** The role each value of the `access` filter stands for. */
const roleOfAccess: Readonly<Record<'edit' | 'comment' | 'view', DocumentRole>> = {
  edit: 'editor',
  comment: 'commenter',
  view: 'viewer',
}

export const pinRoutes: FastifyPluginCallback<RouteDependencies> = (app, { contract, database }, done) => {
  app.route(
    operationRoute(contract, 'pinDocument', async (request, reply) => {
      const { userId } = principalOf(request)
      const { record } = await authoriseDocument(database, request.params.documentId, userId, 'pin', {
        onArchived: false,
      })
      await pinDocument(database, { workspaceId: record.workspace_id, documentId: record.id, userId })
      return reply.code(204).send()
    }),
  )

  app.route(
    operationRoute(contract, 'unpinDocument', async (request, reply) => {
      const { userId } = principalOf(request)
      const { record } = await authoriseDocument(database, request.params.documentId, userId, 'pin', {
        onArchived: false,
      })
      await unpinDocument(database, record.id, userId)
      return reply.code(204).send()
    }),
  )

  app.route(
    operationRoute(contract, 'listPinnedDocuments', async (request): Promise<Schema<'DocumentList'>> => {
      const { userId } = principalOf(request)
      const { workspaceId } = request.params
      await authoriseWorkspace(database, workspaceId, userId, 'workspace-read')
      return { items: (await listPinned(database, workspaceId, userId)).map(presentReadable) }
    }),
  )

  app.route(
    operationRoute(contract, 'listSharedDocuments', async (request): Promise<Schema<'DocumentList'>> => {
      const { userId } = principalOf(request)
      const { workspaceId } = request.params
      const { access } = request.query
      await authoriseWorkspace(database, workspaceId, userId, 'workspace-read')
      const candidates = await listSharedCandidates(database, workspaceId, userId)
      // The role is the domain's, not a column: the person's grant and the general access can differ, and the higher wins.
      const shared = candidates.filter((record) => access === undefined || roleOf(record) === roleOfAccess[access])
      return { items: shared.map(presentReadable) }
    }),
  )

  done()
}
