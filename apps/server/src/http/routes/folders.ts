import type { Schema } from '@draftroom/contract'
import type { FastifyPluginCallback } from 'fastify'
import { deleteFolder, insertFolder, listFolders, renameFolder, type FolderRow } from '../../db/folders.ts'
import { principalOf } from '../auth/authenticate.ts'
import { authoriseFolder, authoriseWorkspace } from '../authorise.ts'
import { operationRoute } from '../operation-route.ts'
import { ProblemError } from '../problem.ts'
import { presentFolder } from '../presenters.ts'
import type { RouteDependencies } from './dependencies.ts'

const revisionConflict = (current: FolderRow): ProblemError =>
  new ProblemError('revision-conflict', { current: presentFolder(current) })

export const folderRoutes: FastifyPluginCallback<RouteDependencies> = (app, { contract, database }, done) => {
  app.route(
    operationRoute(contract, 'listFolders', async (request): Promise<Schema<'FolderList'>> => {
      const { workspaceId } = request.params
      await authoriseWorkspace(database, workspaceId, principalOf(request).userId, 'workspace-read')
      return { items: (await listFolders(database, workspaceId)).map(presentFolder) }
    }),
  )

  app.route(
    operationRoute(contract, 'createFolder', async (request, reply) => {
      const { workspaceId } = request.params
      await authoriseWorkspace(database, workspaceId, principalOf(request).userId, 'create-content')
      const folder = await insertFolder(database, workspaceId, request.body.name)
      return reply.code(201).send(presentFolder(folder) satisfies Schema<'Folder'>)
    }),
  )

  app.route(
    operationRoute(contract, 'updateFolder', async (request): Promise<Schema<'Folder'>> => {
      const { folder } = await authoriseFolder(
        database,
        request.params.folderId,
        principalOf(request).userId,
        'rename-folder',
      )
      const { name, revision } = request.body
      if (revision !== folder.revision) throw revisionConflict(folder)

      const renamed = await renameFolder(database, folder.id, name, revision)
      if (renamed !== undefined) return presentFolder(renamed)
      // Someone else renamed it between the read and the write: the write refused, and they are told what won.
      const current = await authoriseFolder(database, folder.id, principalOf(request).userId, 'rename-folder')
      throw revisionConflict(current.folder)
    }),
  )

  app.route(
    operationRoute(contract, 'deleteFolder', async (request, reply) => {
      const { folder } = await authoriseFolder(
        database,
        request.params.folderId,
        principalOf(request).userId,
        'delete-folder',
      )
      if ((await deleteFolder(database, folder.id)) === 'not-empty') throw new ProblemError('conflict')
      return reply.code(204).send()
    }),
  )

  done()
}
