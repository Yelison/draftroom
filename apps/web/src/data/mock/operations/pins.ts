import type { Schema } from '@draftroom/contract'
import type { DataSource } from '../../DataSource.ts'
import type { DocumentRecord } from '../fixtures/documents.ts'
import { caller, documentOf, workspaceOf, type Context } from '../guards.ts'
import { sortRows } from '../pagination.ts'
import { documentRole } from '../roles.ts'
import { documentView } from '../views.ts'

type PinOperations = Pick<DataSource, 'pinDocument' | 'unpinDocument' | 'listPinnedDocuments' | 'listSharedDocuments'>

const roleOfAccess: Record<'edit' | 'comment' | 'view', Schema<'DocumentRole'>> = {
  edit: 'editor',
  comment: 'commenter',
  view: 'viewer',
}

export function pinOperations(ctx: Context): PinOperations {
  const { world } = ctx

  const byRecency = (rows: DocumentRecord[]) =>
    sortRows(rows, { key: (row) => row.updatedAt, id: (row) => row.id, direction: 'desc' })

  return {
    pinDocument: async ({ params: { path } }) => {
      const user = caller(ctx)
      const { document } = documentOf(ctx, path.documentId)
      if (!world.pins.some((pin) => pin.userId === user.id && pin.documentId === document.id)) {
        world.pins.push({ userId: user.id, documentId: document.id })
      }
    },

    unpinDocument: async ({ params: { path } }) => {
      const user = caller(ctx)
      const { document } = documentOf(ctx, path.documentId)
      world.pins = world.pins.filter((pin) => !(pin.userId === user.id && pin.documentId === document.id))
    },

    listPinnedDocuments: async ({ params: { path } }) => {
      const user = caller(ctx)
      const { workspace } = workspaceOf(ctx, path.workspaceId)
      const pinned = world.documents.filter(
        (document) =>
          document.workspaceId === workspace.id &&
          document.archivedAt === null &&
          documentRole(world, user.id, document) !== undefined &&
          world.pins.some((pin) => pin.userId === user.id && pin.documentId === document.id),
      )
      return { items: byRecency(pinned).map((document) => documentView(world, document, user.id)) }
    },

    listSharedDocuments: async ({ params: { path, query = {} } }) => {
      const user = caller(ctx)
      const { workspace } = workspaceOf(ctx, path.workspaceId)
      const wanted = query.access === undefined ? undefined : roleOfAccess[query.access]
      const shared = world.documents.filter((document) => {
        if (document.workspaceId !== workspace.id || document.archivedAt !== null) return false
        const role = documentRole(world, user.id, document)
        return role !== undefined && role !== 'owner' && (wanted === undefined || role === wanted)
      })
      return { items: byRecency(shared).map((document) => documentView(world, document, user.id)) }
    },
  }
}
