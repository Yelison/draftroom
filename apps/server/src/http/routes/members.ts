import type { Schema } from '@draftroom/contract'
import type { FastifyPluginCallback } from 'fastify'
import { leavesNoOwner } from '../../domain/access.ts'
import { canInWorkspace } from '../../domain/permissions.ts'
import {
  insertMember,
  lockMembers,
  ownersOf,
  removeMember,
  updateMemberRole,
  type LockedMember,
} from '../../db/members/commands.ts'
import { findMember, listMembers } from '../../db/members/queries.ts'
import { principalOf } from '../auth/authenticate.ts'
import { authoriseWorkspace } from '../authorise.ts'
import { operationRoute } from '../operation-route.ts'
import { ProblemError } from '../problem.ts'
import { presentMember } from '../presenters.ts'
import { afterCommit } from './after-commit.ts'
import type { RouteDependencies } from './dependencies.ts'

// The same order of checks as every route: the workspace and the right to read it (404), the role (403), the member the
// request names (404) and the state (409). The role is read again once the owners are locked, as it is for access
// (ADR 0012): an owner who was demoted at the same moment is refused, and the transaction rolls back.

/** The person who asks, as the locked memberships hold them: still allowed to change members, or refused as the role now is. */
function requireManager(locked: readonly LockedMember[], actorId: string): void {
  const actor = locked.find(({ userId }) => userId === actorId)
  if (actor === undefined) throw new ProblemError('not-found')
  if (!canInWorkspace(actor.role, 'manage-members')) throw new ProblemError('forbidden')
}

const memberOf = (locked: readonly LockedMember[], userId: string): LockedMember =>
  locked.find((member) => member.userId === userId) ?? failWith('not-found')

const failWith = (code: 'not-found'): never => {
  throw new ProblemError(code)
}

export const memberRoutes: FastifyPluginCallback<RouteDependencies> = (
  app,
  { contract, database, liveAccess },
  done,
) => {
  app.route(
    operationRoute(contract, 'listMembers', async (request): Promise<Schema<'MemberList'>> => {
      const { workspaceId } = request.params
      await authoriseWorkspace(database, workspaceId, principalOf(request).userId, 'workspace-read')
      return { items: (await listMembers(database, workspaceId)).map(presentMember) }
    }),
  )

  app.route(
    operationRoute(contract, 'addMember', async (request, reply) => {
      const { userId: actorId } = principalOf(request)
      const { workspaceId } = request.params
      const { email, role } = request.body
      await authoriseWorkspace(database, workspaceId, actorId, 'manage-members')

      const member = await database.transaction().execute(async (trx) => {
        requireManager(await lockMembers(trx, workspaceId, [actorId]), actorId)
        return insertMember(trx, { workspaceId, email, role })
      })
      // Already in the workspace, whether they have signed up or not.
      if (member === null) throw new ProblemError('conflict')
      return reply.code(201).send(presentMember(member))
    }),
  )

  app.route(
    operationRoute(contract, 'updateMember', async (request): Promise<Schema<'Member'>> => {
      const { userId: actorId } = principalOf(request)
      const { workspaceId, userId: targetId } = request.params
      const { role } = request.body
      await authoriseWorkspace(database, workspaceId, actorId, 'manage-members')

      const { member, changed } = await database.transaction().execute(async (trx) => {
        const locked = await lockMembers(trx, workspaceId, [actorId, targetId])
        requireManager(locked, actorId)
        const target = memberOf(locked, targetId)
        const changed = target.role !== role
        if (changed && role === 'member' && leavesNoOwner(ownersOf(locked), targetId)) {
          throw new ProblemError('last-owner')
        }
        if (changed) await updateMemberRole(trx, workspaceId, targetId, role)
        const written = await findMember(trx, workspaceId, targetId)
        if (written === undefined)
          throw new Error(`Member ${targetId} of ${workspaceId} is not there after it was written`)
        return { member: written, changed }
      })
      if (changed)
        await afterCommit(request, 'holding their connections to the new role', () =>
          liveAccess.memberChanged(workspaceId, targetId),
        )
      return presentMember(member)
    }),
  )

  app.route(
    operationRoute(contract, 'removeMember', async (request, reply) => {
      const { userId: actorId } = principalOf(request)
      const { workspaceId, userId: targetId } = request.params
      await authoriseWorkspace(database, workspaceId, actorId, 'manage-members')

      const handedOver = await database.transaction().execute(async (trx) => {
        const locked = await lockMembers(trx, workspaceId, [actorId, targetId])
        requireManager(locked, actorId)
        memberOf(locked, targetId)
        if (leavesNoOwner(ownersOf(locked), targetId)) throw new ProblemError('last-owner')
        return removeMember(trx, { workspaceId, actorId, removedId: targetId, owners: ownersOf(locked) })
      })
      await afterCommit(request, 'closing the connections of the member who was removed', () =>
        liveAccess.memberChanged(workspaceId, targetId),
      )
      // The documents that changed hands: their owners have the access list open, and it has a new line.
      for (const documentId of handedOver) {
        await afterCommit(request, 'telling the people who have a handed-over document open', () =>
          liveAccess.documentChanged(documentId),
        )
      }
      return reply.code(204).send()
    }),
  )

  done()
}
