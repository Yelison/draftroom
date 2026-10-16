import type { Schema } from '@draftroom/contract'
import type { FastifyPluginCallback } from 'fastify'
import { deleteGrant, lockAccessChange, updateGeneralAccess, upsertGrant } from '../../db/access/commands.ts'
import { explicitOwners, findGrant, isMemberOf, listGrants } from '../../db/access/queries.ts'
import { recordActivity } from '../../db/activity.ts'
import { grantActivity, leavesNoOwner } from '../../domain/access.ts'
import { principalOf } from '../auth/authenticate.ts'
import { authoriseDocument } from '../authorise.ts'
import { operationRoute } from '../operation-route.ts'
import { ProblemError } from '../problem.ts'
import { presentGrant } from '../presenters.ts'
import { afterCommit } from './after-commit.ts'
import type { RouteDependencies } from './dependencies.ts'

// The order of the checks of docs/api/README.md is the order of each handler: the session and the shape of the request
// have been checked by the hooks of the app; then the document and the right to read it (404), the role (403), the
// person the request names (404) and the state (409 `last-owner`).
//
// The role is read twice, as ADR 0012 says. Outside the transaction it keeps a person who may not change access from
// taking any lock. Inside, once the locks of `lockAccessChange` are held, it is read again, because a change that took
// the role away at the same moment committed before the locks or waited for them, and either way is seen: a revoked owner
// is refused with the answer the role gives now, and the transaction rolls back.

export const accessRoutes: FastifyPluginCallback<RouteDependencies> = (
  app,
  { contract, database, liveAccess },
  done,
) => {
  app.route(
    operationRoute(contract, 'listAccess', async (request): Promise<Schema<'AccessList'>> => {
      const { record } = await authoriseDocument(
        database,
        request.params.documentId,
        principalOf(request).userId,
        'manage-access',
        { onArchived: false },
      )
      return { items: (await listGrants(database, record.id)).map(presentGrant), generalAccess: record.general_access }
    }),
  )

  app.route(
    operationRoute(contract, 'setAccess', async (request): Promise<Schema<'AccessEntry'>> => {
      const { userId: actorId } = principalOf(request)
      const { documentId, userId: targetId } = request.params
      const { role } = request.body
      const { record } = await authoriseDocument(database, documentId, actorId, 'manage-access', { onArchived: false })

      const { entry, changed } = await database.transaction().execute(async (trx) => {
        await lockAccessChange(trx, { workspaceId: record.workspace_id, documentId, userIds: [actorId, targetId] })
        await authoriseDocument(trx, documentId, actorId, 'manage-access', { onArchived: false })
        // Someone outside the workspace is not somebody the owner may know exists, so it is the answer for an unknown person.
        if (!(await isMemberOf(trx, record.workspace_id, targetId))) throw new ProblemError('not-found')

        const previous = await findGrant(trx, documentId, targetId)
        // A grant to the role the person already holds is not a change: nothing is written, recorded or announced.
        if (previous?.role === role) return { entry: previous, changed: false }
        if (previous?.role === 'owner' && role !== 'owner') {
          const owners = (await explicitOwners(trx, [documentId])).get(documentId) ?? []
          if (leavesNoOwner(owners, targetId)) throw new ProblemError('last-owner')
        }
        await upsertGrant(trx, { workspaceId: record.workspace_id, documentId, userId: targetId, role })
        await recordActivity(trx, [
          {
            workspaceId: record.workspace_id,
            documentId,
            type: grantActivity(previous?.role ?? null),
            actorId,
            targetUserId: targetId,
          },
        ])
        const written = await findGrant(trx, documentId, targetId)
        if (written === undefined)
          throw new Error(`The grant of ${targetId} on ${documentId} is not there after it was written`)
        return { entry: written, changed: true }
      })
      if (changed)
        await afterCommit(request, 'holding the connections to the new access', () =>
          liveAccess.documentChanged(documentId),
        )
      return presentGrant(entry)
    }),
  )

  app.route(
    operationRoute(contract, 'removeAccess', async (request, reply) => {
      const { userId: actorId } = principalOf(request)
      const { documentId, userId: targetId } = request.params
      const { record } = await authoriseDocument(database, documentId, actorId, 'manage-access', { onArchived: false })

      await database.transaction().execute(async (trx) => {
        await lockAccessChange(trx, { workspaceId: record.workspace_id, documentId, userIds: [actorId, targetId] })
        await authoriseDocument(trx, documentId, actorId, 'manage-access', { onArchived: false })
        // Not idempotent: a grant that is not there is a 404, so a second request tells the person something went differently.
        const previous = await findGrant(trx, documentId, targetId)
        if (previous === undefined) throw new ProblemError('not-found')
        if (previous.role === 'owner') {
          const owners = (await explicitOwners(trx, [documentId])).get(documentId) ?? []
          if (leavesNoOwner(owners, targetId)) throw new ProblemError('last-owner')
        }
        await deleteGrant(trx, documentId, targetId)
        await recordActivity(trx, [
          { workspaceId: record.workspace_id, documentId, type: 'access.revoked', actorId, targetUserId: targetId },
        ])
      })
      await afterCommit(request, 'holding the connections to the access that was removed', () =>
        liveAccess.documentChanged(documentId),
      )
      return reply.code(204).send()
    }),
  )

  app.route(
    operationRoute(contract, 'setGeneralAccess', async (request): Promise<Schema<'GeneralAccessSetting'>> => {
      const { userId: actorId } = principalOf(request)
      const { documentId } = request.params
      const { generalAccess } = request.body
      const { record } = await authoriseDocument(database, documentId, actorId, 'manage-access', { onArchived: false })

      const changed = await database.transaction().execute(async (trx) => {
        await lockAccessChange(trx, { workspaceId: record.workspace_id, documentId, userIds: [actorId] })
        const { record: locked } = await authoriseDocument(trx, documentId, actorId, 'manage-access', {
          onArchived: false,
        })
        // The setting the document has once it is locked, not the one the request found before: a change is a change from that.
        if (locked.general_access === generalAccess) return false
        await updateGeneralAccess(trx, documentId, generalAccess)
        await recordActivity(trx, [
          { workspaceId: record.workspace_id, documentId, type: 'general-access.changed', actorId },
        ])
        return true
      })
      if (changed)
        await afterCommit(request, 'holding the connections to the new general access', () =>
          liveAccess.documentChanged(documentId),
        )
      return { generalAccess }
    }),
  )

  done()
}
