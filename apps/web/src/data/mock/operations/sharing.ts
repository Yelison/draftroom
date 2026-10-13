import type { Schema } from '@draftroom/contract'
import type { DataSource } from '../../DataSource.ts'
import { record } from '../events.ts'
import { caller, documentOf, requireRole, type Context } from '../guards.ts'
import { sortRows } from '../pagination.ts'
import { lastOwner, notFound } from '../problems.ts'
import { accessEntryView } from '../views.ts'

type SharingOperations = Pick<DataSource, 'listAccess' | 'setAccess' | 'removeAccess' | 'setGeneralAccess'>

export function sharingOperations(ctx: Context): SharingOperations {
  const { world } = ctx

  /** The owner's view of who can open a document: the people in the workspace the grant can be about. */
  function memberOf(workspaceId: string, userId: string) {
    if (!world.memberships.some((row) => row.workspaceId === workspaceId && row.userId === userId)) throw notFound()
  }

  const explicitOwners = (documentId: string) =>
    world.grants.filter((row) => row.documentId === documentId && row.role === 'owner')

  return {
    listAccess: async ({ params: { path } }) => {
      caller(ctx)
      const { document, role } = documentOf(ctx, path.documentId)
      requireRole(role, 'owner')
      const grants = world.grants.filter((row) => row.documentId === document.id)
      return {
        items: sortRows(grants, { key: (row) => row.createdAt, id: (row) => row.userId, direction: 'asc' }).map((row) =>
          accessEntryView(world, row),
        ),
        generalAccess: document.generalAccess,
      }
    },

    setAccess: async ({ params: { path }, body }) => {
      const user = caller(ctx)
      const { document, role } = documentOf(ctx, path.documentId)
      requireRole(role, 'owner')
      memberOf(document.workspaceId, path.userId)

      const existing = world.grants.find((row) => row.documentId === document.id && row.userId === path.userId)
      if (existing?.role === 'owner' && body.role !== 'owner' && explicitOwners(document.id).length === 1) {
        throw lastOwner()
      }
      if (existing === undefined) {
        const grant = { documentId: document.id, userId: path.userId, role: body.role, createdAt: world.now() }
        world.grants.push(grant)
        record(world, 'access.granted', user.id, document.id, path.userId)
        return accessEntryView(world, grant)
      }
      if (existing.role !== body.role) {
        existing.role = body.role
        record(world, 'access.changed', user.id, document.id, path.userId)
      }
      return accessEntryView(world, existing)
    },

    removeAccess: async ({ params: { path } }) => {
      const user = caller(ctx)
      const { document, role } = documentOf(ctx, path.documentId)
      requireRole(role, 'owner')
      memberOf(document.workspaceId, path.userId)
      // The contract does not call this idempotent, so a grant that is not there is as good as a missing resource.
      const grant = world.grants.find((row) => row.documentId === document.id && row.userId === path.userId)
      if (grant === undefined) throw notFound()
      if (grant.role === 'owner' && explicitOwners(document.id).length === 1) throw lastOwner()
      world.grants.splice(world.grants.indexOf(grant), 1)
      record(world, 'access.revoked', user.id, document.id, path.userId)
    },

    setGeneralAccess: async ({ params: { path }, body }): Promise<Schema<'GeneralAccessSetting'>> => {
      const user = caller(ctx)
      const { document, role } = documentOf(ctx, path.documentId)
      requireRole(role, 'owner')
      if (document.generalAccess !== body.generalAccess) {
        document.generalAccess = body.generalAccess
        record(world, 'general-access.changed', user.id, document.id)
      }
      return { generalAccess: document.generalAccess }
    },
  }
}
