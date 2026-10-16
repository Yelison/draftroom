// The mock plays the server here (a document made from a template is written by the server), so it may do what
// the server does.
// oxlint-disable-next-line no-restricted-imports
import { jsonToYUpdate } from '@draftroom/editor-schema/convert'
import type { DataSource } from '../../DataSource.ts'
import type { DocumentRecord } from '../fixtures/documents.ts'
import { templateContent } from '../fixtures/templateContent.ts'
import { record } from '../events.ts'
import { caller, documentOf, requireRole, workspaceOf, type Context } from '../guards.ts'
import { textLimits } from '../limits.ts'
import { paginate, readPage } from '../pagination.ts'
import { conflict, documentChanged, invalid } from '../problems.ts'
import { documentRole } from '../roles.ts'
import { checkParameterText, checkTexts } from '../text.ts'
import { documentView } from '../views.ts'

type DocumentOperations = Pick<
  DataSource,
  | 'listDocuments'
  | 'createDocument'
  | 'getDocument'
  | 'updateDocument'
  | 'deleteDocument'
  | 'archiveDocument'
  | 'restoreDocument'
>

const byRecency = {
  key: (row: DocumentRecord) => row.updatedAt,
  id: (row: DocumentRecord) => row.id,
  direction: 'desc',
} as const

export function documentOperations(ctx: Context): DocumentOperations {
  const { world } = ctx

  /** A folder reference that is unknown, or belongs to another workspace, is the same `400`: ids cannot be probed. */
  function checkFolder(workspaceId: string, folderId: string | null | undefined, pointer: string) {
    if (folderId == null) return
    if (!world.folders.some((row) => row.id === folderId && row.workspaceId === workspaceId)) {
      throw invalid({ pointer, code: 'invalid-value' })
    }
  }

  /** Archiving and restoring are idempotent: only a real change moves the revision and leaves a trace. */
  function setArchived(documentId: string, archived: boolean) {
    const user = caller(ctx)
    const { document, role } = documentOf(ctx, documentId, { archived: 'allow' })
    requireRole(role, 'owner')
    if ((document.archivedAt !== null) !== archived) {
      const at = world.now()
      document.archivedAt = archived ? at : null
      document.updatedAt = at
      document.revision += 1
      record(world, archived ? 'document.archived' : 'document.restored', user.id, document.id)
    }
    return documentView(world, document, user.id)
  }

  return {
    listDocuments: async ({ params: { path, query = {} } }) => {
      const user = caller(ctx)
      const filters = {
        workspaceId: path.workspaceId,
        query: query.query,
        folderId: query.folderId,
        archived: query.archived === true,
      }
      if (query.query !== undefined) checkParameterText('/query/query', query.query, textLimits.search)
      const page = readPage(query, filters)
      const { workspace } = workspaceOf(ctx, path.workspaceId)
      checkFolder(workspace.id, query.folderId, '/query/folderId')

      const needle = query.query?.toLowerCase()
      const rows = world.documents.filter((document) => {
        if (document.workspaceId !== workspace.id) return false
        const role = documentRole(world, user.id, document)
        if (role === undefined || (document.archivedAt !== null) !== (query.archived === true)) return false
        if (query.folderId !== undefined && document.folderId !== query.folderId) return false
        return needle === undefined || `${document.title}\n${document.excerpt ?? ''}`.toLowerCase().includes(needle)
      })
      const { items, nextCursor } = paginate(rows, byRecency, page)
      return { items: items.map((document) => documentView(world, document, user.id)), nextCursor }
    },

    createDocument: async ({ params: { path }, body }) => {
      const user = caller(ctx)
      checkTexts(['/title', body.title, textLimits.documentTitle])
      if (body.locale !== undefined && body.templateId === undefined) {
        throw invalid({ pointer: '/templateId', code: 'required' })
      }
      const { workspace } = workspaceOf(ctx, path.workspaceId)
      checkFolder(workspace.id, body.folderId, '/folderId')
      const template =
        body.templateId === undefined ? undefined : world.templates.find((row) => row.id === body.templateId)
      if (body.templateId !== undefined && template === undefined) {
        throw invalid({ pointer: '/templateId', code: 'invalid-value' })
      }

      const at = world.now()
      const document: DocumentRecord = {
        id: world.newId(),
        workspaceId: workspace.id,
        folderId: body.folderId ?? null,
        title: body.title,
        excerpt: template?.text[body.locale ?? 'en'].excerpt ?? null,
        revision: 1,
        generalAccess: 'none',
        createdBy: user.id,
        createdAt: at,
        updatedAt: at,
        archivedAt: null,
      }
      world.documents.push(document)
      world.grants.push({ documentId: document.id, userId: user.id, role: 'owner', createdAt: at })
      record(world, 'document.created', user.id, document.id)
      if (template !== undefined) {
        // The mock is the server here: it writes the template's content as the server does, so the client never
        // builds it.
        const content = templateContent[body.locale ?? 'en'][template.id] ?? []
        ctx.startContent(document.id, jsonToYUpdate({ type: 'doc', content: [...content] }))
      }
      return documentView(world, document, user.id)
    },

    getDocument: async ({ params: { path } }) => {
      const user = caller(ctx)
      return documentView(world, documentOf(ctx, path.documentId, { archived: 'allow' }).document, user.id)
    },

    updateDocument: async ({ params: { path }, body }) => {
      const user = caller(ctx)
      if (body.title !== undefined) checkTexts(['/title', body.title, textLimits.documentTitle])
      const { document, role } = documentOf(ctx, path.documentId)
      requireRole(role, 'editor')
      checkFolder(document.workspaceId, body.folderId, '/folderId')
      if (body.revision !== document.revision) throw documentChanged(documentView(world, document, user.id))

      const renamed = body.title !== undefined && body.title !== document.title
      const moved = body.folderId !== undefined && body.folderId !== document.folderId
      if (renamed || moved) {
        if (renamed) document.title = body.title ?? document.title
        if (moved) document.folderId = body.folderId ?? null
        document.revision += 1
        document.updatedAt = world.now()
        if (renamed) record(world, 'document.renamed', user.id, document.id)
        if (moved) record(world, 'document.moved', user.id, document.id)
      }
      return documentView(world, document, user.id)
    },

    deleteDocument: async ({ params: { path } }) => {
      caller(ctx)
      const { document, role } = documentOf(ctx, path.documentId, { archived: 'allow' })
      requireRole(role, 'owner')
      if (document.archivedAt === null) throw conflict()
      // The document takes with it everything that hangs from it.
      world.documents.splice(world.documents.indexOf(document), 1)
      world.grants = world.grants.filter((row) => row.documentId !== document.id)
      world.pins = world.pins.filter((row) => row.documentId !== document.id)
      world.threads = world.threads.filter((row) => row.documentId !== document.id)
      world.versions = world.versions.filter((row) => row.documentId !== document.id)
      world.activity = world.activity.filter((row) => row.documentId !== document.id)
    },

    archiveDocument: async ({ params: { path } }) => setArchived(path.documentId, true),
    restoreDocument: async ({ params: { path } }) => setArchived(path.documentId, false),
  }
}
