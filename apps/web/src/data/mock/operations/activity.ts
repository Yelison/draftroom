import type { DataSource } from '../../DataSource.ts'
import type { ActivityRecord } from '../fixtures/collaboration.ts'
import { sharingEvents } from '../events.ts'
import { caller, documentOf, workspaceOf, type Context } from '../guards.ts'
import { paginate, readPage } from '../pagination.ts'
import { invalid } from '../problems.ts'
import { documentRole } from '../roles.ts'
import { activityView } from '../views.ts'

type ActivityOperations = Pick<DataSource, 'listWorkspaceActivity' | 'listDocumentActivity'>

const newestFirst = {
  key: (row: ActivityRecord) => row.createdAt,
  id: (row: ActivityRecord) => row.id,
  direction: 'desc',
} as const

const isInstant = (value: string) => !Number.isNaN(Date.parse(value))

export function activityOperations(ctx: Context): ActivityOperations {
  const { world } = ctx

  /**
   * The events of one document that the caller may be told about: the ones that reveal how it is shared are for its
   * owners alone.
   */
  function visibleEvents(documentId: string, userId: string): ActivityRecord[] {
    const document = world.documents.find((row) => row.id === documentId)
    if (document === undefined) return []
    const role = documentRole(world, userId, document)
    if (role === undefined) return []
    return world.activity.filter(
      (event) => event.documentId === documentId && (role === 'owner' || !sharingEvents.has(event.type)),
    )
  }

  return {
    listWorkspaceActivity: async ({ params: { path, query = {} } }) => {
      const user = caller(ctx)
      for (const name of ['from', 'to'] as const) {
        const value = query[name]
        if (value !== undefined && !isInstant(value))
          throw invalid({ pointer: `/query/${name}`, code: 'invalid-format' })
      }
      const { documentId, actorId, from, to } = query
      const page = readPage(query, { workspaceId: path.workspaceId, documentId, actorId, from, to })
      const { workspace } = workspaceOf(ctx, path.workspaceId)

      const events = world.documents
        .filter((document) => document.workspaceId === workspace.id)
        .flatMap((document) => visibleEvents(document.id, user.id))
        .filter(
          (event) =>
            (query.documentId === undefined || event.documentId === query.documentId) &&
            (query.actorId === undefined || event.actorId === query.actorId) &&
            (query.from === undefined || Date.parse(event.createdAt) >= Date.parse(query.from)) &&
            (query.to === undefined || Date.parse(event.createdAt) < Date.parse(query.to)),
        )
      const { items, nextCursor } = paginate(events, newestFirst, page)
      return {
        items: items.flatMap((event) => {
          const document = world.documents.find((row) => row.id === event.documentId)
          return document === undefined ? [] : [activityView(world, event, document)]
        }),
        nextCursor,
      }
    },

    listDocumentActivity: async ({ params: { path, query = {} } }) => {
      const user = caller(ctx)
      const page = readPage(query, { documentId: path.documentId })
      const { document } = documentOf(ctx, path.documentId)
      const { items, nextCursor } = paginate(visibleEvents(document.id, user.id), newestFirst, page)
      return { items: items.map((event) => activityView(world, event, document)), nextCursor }
    },
  }
}
