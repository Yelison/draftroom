import type { Schema } from '@draftroom/contract'
import { contractLimits } from '@draftroom/contract'
import type { FastifyPluginCallback } from 'fastify'
import { insertVersion } from '../../db/versions/commands.ts'
import { findVersion, getVersion, listVersions, readVersionState } from '../../db/versions/queries.ts'
import { decodeCursor, encodeCursor, type CursorFilters } from '../../domain/pagination.ts'
import { principalOf } from '../auth/authenticate.ts'
import { authoriseDocument } from '../authorise.ts'
import { DocumentGoneError, RestoreConflictError } from '../live-documents.ts'
import { operationRoute } from '../operation-route.ts'
import { presentVersion } from '../presenters.ts'
import { ProblemError } from '../problem.ts'
import { afterCommit } from './after-commit.ts'
import type { RouteDependencies } from './dependencies.ts'

// The order of the checks of docs/api/README.md is the order of each handler: the session and the shape of the request
// have been checked by the hooks of the app; then the document (or the version, and the document it belongs to) and the
// right to read it (404), the role (403), and only then what the request asks. A version of an archived document is as
// hidden as the document, so `onArchived` is never set.
//
// What a version holds is taken from the live document when people have it open, which only the collaboration server can
// do (`LiveDocuments`). A write is told to the connections of the document once it has committed, and a failure to tell
// them is logged: the change stands, and the person who asked has nothing to undo.

export const versionRoutes: FastifyPluginCallback<RouteDependencies> = (
  app,
  { contract, database, broadcaster, liveDocuments },
  done,
) => {
  const announce = (request: Parameters<typeof afterCommit>[0], documentId: string) =>
    afterCommit(request, 'telling the people who have the document open about its versions', async () =>
      broadcaster.broadcast(documentId, { type: 'versions-changed' }),
    )

  // The document was deleted for good between the check and the work: the answer is the one for an id never there.
  const asNotFound = (error: unknown): unknown =>
    error instanceof DocumentGoneError ? new ProblemError('not-found') : error

  app.route(
    operationRoute(contract, 'listVersions', async (request): Promise<Schema<'VersionPage'>> => {
      const { userId } = principalOf(request)
      const { documentId } = request.params
      const { cursor, limit = contractLimits.page.defaultSize } = request.query

      // A cursor says nothing about a resource: whether it fits this list is the shape of the request, which is checked
      // before anyone is told whether the document exists.
      const filters: CursorFilters = { documentId }
      const after = cursor === undefined ? undefined : decodeCursor(cursor, filters)
      if (after === null) {
        throw new ProblemError('validation-failed', { errors: [{ pointer: '/query/cursor', code: 'invalid-value' }] })
      }

      const { record } = await authoriseDocument(database, documentId, userId, 'read-versions', { onArchived: false })
      const page = await listVersions(database, {
        workspaceId: record.workspace_id,
        documentId: record.id,
        limit,
        ...(after === undefined ? {} : { after }),
      })
      return {
        items: page.records.map(presentVersion),
        nextCursor: page.next === null ? null : encodeCursor(page.next, filters),
      }
    }),
  )

  app.route(
    operationRoute(contract, 'createVersion', async (request, reply) => {
      const { userId } = principalOf(request)
      const { record } = await authoriseDocument(database, request.params.documentId, userId, 'create-version', {
        onArchived: false,
      })
      const label = request.body?.label

      // The version is written while the state it holds cannot change under it: the live state is captured and saved under
      // the document's store mutex, so a restore or a store never comes between the two.
      const version = await liveDocuments
        .withState(record.id, (state) =>
          database.transaction().execute(async (trx) => {
            const versionId = await insertVersion(trx, {
              workspaceId: record.workspace_id,
              documentId: record.id,
              kind: 'manual',
              state,
              actorId: userId,
              ...(label === undefined ? {} : { label }),
            })
            return getVersion(trx, versionId)
          }),
        )
        .catch((error: unknown) => {
          throw asNotFound(error)
        })
      if (version === undefined) throw new ProblemError('not-found')

      await announce(request, record.id)
      return reply.code(201).send(presentVersion(version))
    }),
  )

  app.route(
    operationRoute(contract, 'getVersionContent', async (request, reply) => {
      const { userId } = principalOf(request)
      const location = await findVersion(database, request.params.versionId)
      if (location === undefined) throw new ProblemError('not-found')
      await authoriseDocument(database, location.document_id, userId, 'read-versions', { onArchived: false })

      const state = await readVersionState(database, location.id)
      if (state === undefined) throw new ProblemError('not-found')
      return reply.type('application/octet-stream').send(Buffer.from(state))
    }),
  )

  app.route(
    operationRoute(contract, 'restoreVersion', async (request): Promise<Schema<'Version'>> => {
      const { userId } = principalOf(request)
      const location = await findVersion(database, request.params.versionId)
      if (location === undefined) throw new ProblemError('not-found')
      const { record } = await authoriseDocument(database, location.document_id, userId, 'restore-version', {
        onArchived: false,
      })

      const restored = await liveDocuments
        .restore({
          versionId: location.id,
          workspaceId: record.workspace_id,
          documentId: record.id,
          actorId: userId,
        })
        .catch((error: unknown) => {
          throw error instanceof RestoreConflictError ? new ProblemError('conflict') : asNotFound(error)
        })

      await announce(request, record.id)
      return presentVersion(restored)
    }),
  )

  done()
}
