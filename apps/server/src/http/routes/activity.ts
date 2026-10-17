import type { Schema } from '@draftroom/contract'
import { contractLimits } from '@draftroom/contract'
import type { FastifyPluginCallback } from 'fastify'
import { listActivity, type ActivityPerson, type ActivityRecord } from '../../db/activity-feed.ts'
import { isStorableInstant } from '../../domain/instants.ts'
import { decodeCursor, encodeCursor, type CursorFilters } from '../../domain/pagination.ts'
import { principalOf } from '../auth/authenticate.ts'
import { authoriseDocument, authoriseWorkspace } from '../authorise.ts'
import { operationRoute } from '../operation-route.ts'
import { ProblemError } from '../problem.ts'
import type { RouteDependencies } from './dependencies.ts'

// Which events a person is told about is decided by the query itself (`listActivity`): the documents they can read at
// this moment, and the events that reveal how a document is shared only for its owners. The routes check what the
// request names, in the order of docs/api/README.md, and present what comes back.

const maxNameLength = 80

/**
 * A member added by email has no name until they sign up, and a grant to them is an event about them, which the contract
 * words with a name. The address they were added with stands in, which the only people told of these events, the
 * owners, already read in the access list of the document.
 */
function presentPerson({ id, name, email }: ActivityPerson): Schema<'UserRef'> {
  return { id, name: name ?? email.slice(0, maxNameLength) }
}

const presentActivity = (record: ActivityRecord): Schema<'ActivityEvent'> => ({
  id: record.id,
  type: record.type,
  createdAt: record.createdAt.toISOString(),
  actor: record.actor === null ? null : presentPerson(record.actor),
  document: record.document,
  targetUser: record.targetUser === null ? null : presentPerson(record.targetUser),
})

export const activityRoutes: FastifyPluginCallback<RouteDependencies> = (app, { contract, database }, done) => {
  // A cursor says nothing about a resource: whether it fits these filters is the shape of the request, which is checked
  // before anyone is told whether the workspace or the document exists.
  const positionOf = (cursor: string | undefined, filters: CursorFilters) => {
    const after = cursor === undefined ? undefined : decodeCursor(cursor, filters)
    if (after === null) {
      throw new ProblemError('validation-failed', { errors: [{ pointer: '/query/cursor', code: 'invalid-value' }] })
    }
    return after
  }

  app.route(
    operationRoute(contract, 'listWorkspaceActivity', async (request): Promise<Schema<'ActivityPage'>> => {
      const { userId } = principalOf(request)
      const { workspaceId } = request.params
      const { documentId, actorId, from, to, cursor, limit = contractLimits.page.defaultSize } = request.query

      const unstorable = (['from', 'to'] as const).filter((name) => {
        const instant = request.query[name]
        return instant !== undefined && !isStorableInstant(instant)
      })
      if (unstorable.length > 0) {
        throw new ProblemError('validation-failed', {
          errors: unstorable.map((name) => ({ pointer: `/query/${name}`, code: 'invalid-value' })),
        })
      }

      const filters: CursorFilters = {
        workspaceId,
        documentId: documentId ?? null,
        actorId: actorId ?? null,
        from: from ?? null,
        to: to ?? null,
      }
      const after = positionOf(cursor, filters)
      await authoriseWorkspace(database, workspaceId, userId, 'workspace-read')

      // A document that does not exist, one of another workspace and one the person cannot read leave the same empty
      // page: the filter only narrows what the person may already read.
      const page = await listActivity(database, {
        userId,
        workspaceId,
        limit,
        ...(documentId === undefined ? {} : { documentId }),
        ...(actorId === undefined ? {} : { actorId }),
        ...(from === undefined ? {} : { from }),
        ...(to === undefined ? {} : { to }),
        ...(after === undefined ? {} : { after }),
      })
      return {
        items: page.records.map(presentActivity),
        nextCursor: page.next === null ? null : encodeCursor(page.next, filters),
      }
    }),
  )

  app.route(
    operationRoute(contract, 'listDocumentActivity', async (request): Promise<Schema<'ActivityPage'>> => {
      const { userId } = principalOf(request)
      const { documentId } = request.params
      const { cursor, limit = contractLimits.page.defaultSize } = request.query

      const filters: CursorFilters = { documentId }
      const after = positionOf(cursor, filters)
      const { record } = await authoriseDocument(database, documentId, userId, 'read', { onArchived: false })

      const page = await listActivity(database, {
        userId,
        workspaceId: record.workspace_id,
        documentId: record.id,
        limit,
        ...(after === undefined ? {} : { after }),
      })
      return {
        items: page.records.map(presentActivity),
        nextCursor: page.next === null ? null : encodeCursor(page.next, filters),
      }
    }),
  )

  done()
}
