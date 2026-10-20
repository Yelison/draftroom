import type { Schema } from '@draftroom/contract'
import { contractLimits } from '@draftroom/contract'
import { InvalidDocumentError } from '@draftroom/editor-schema/convert'
import type { FastifyPluginCallback } from 'fastify'
import { listDocuments } from '../../db/documents/caller-documents.ts'
import { createDocumentRows, deleteArchivedDocument, setArchived, updateMetadata } from '../../db/documents/commands.ts'
import { readDocumentState } from '../../db/documents/state.ts'
import { folderBelongsTo, isForeignKeyViolation } from '../../db/folders.ts'
import { metadataChanges } from '../../domain/documents.ts'
import { copyOfContent, type ContentCopy } from '../../domain/duplicate.ts'
import { decodeCursor, encodeCursor, type CursorFilters } from '../../domain/pagination.ts'
import { builtInTemplates } from '../../domain/templates/built-in.ts'
import { principalOf } from '../auth/authenticate.ts'
import { authoriseDocument, authoriseWorkspace, type AuthorisedDocument } from '../authorise.ts'
import { operationRoute } from '../operation-route.ts'
import { ProblemError } from '../problem.ts'
import { presentDocument, presentReadable } from '../presenters.ts'
import { afterCommit } from './after-commit.ts'
import type { RouteDependencies } from './dependencies.ts'

type FieldError = Schema<'FieldError'>

const invalidValue = (pointer: string): FieldError => ({ pointer, code: 'invalid-value' })

/**
 * A folder that was there when it was checked and is gone when the document is written: the database refuses the row.
 * It is the same answer as a folder that was never there, not a failure of the server.
 */
const folderWentAway = (error: unknown): unknown =>
  isForeignKeyViolation(error, 'documents_folder_fkey')
    ? new ProblemError('validation-failed', { errors: [invalidValue('/folderId')] })
    : error

/** The stored state is one the schema cannot read: nothing to copy, and not something the caller can fix. */
function copyOrConflict(state: Uint8Array): ContentCopy {
  try {
    return copyOfContent(state)
  } catch (error) {
    throw error instanceof InvalidDocumentError ? new ProblemError('conflict') : error
  }
}

export const documentRoutes: FastifyPluginCallback<RouteDependencies> = (
  app,
  { contract, database, broadcaster, liveAccess },
  done,
) => {
  const present = ({ record, role }: AuthorisedDocument): Schema<'Document'> => presentDocument(record, role)

  /** The document as it is now, for an answer that follows a change: the person may no longer be allowed to see it. */
  const reload = (documentId: string, userId: string) =>
    authoriseDocument(database, documentId, userId, 'read', { onArchived: true })

  const revisionConflict = (current: AuthorisedDocument): ProblemError =>
    new ProblemError('revision-conflict', { current: present(current) })

  app.route(
    operationRoute(contract, 'listDocuments', async (request): Promise<Schema<'DocumentPage'>> => {
      const { userId } = principalOf(request)
      const { workspaceId } = request.params
      const { query, folderId, archived = false, cursor, limit = contractLimits.page.defaultSize } = request.query

      // A cursor says nothing about a resource: whether it fits these filters is the shape of the request, which is
      // checked before anyone is told whether the workspace exists.
      const filters: CursorFilters = { workspaceId, query: query ?? null, folderId: folderId ?? null, archived }
      const after = cursor === undefined ? undefined : decodeCursor(cursor, filters)
      if (after === null) throw new ProblemError('validation-failed', { errors: [invalidValue('/query/cursor')] })

      await authoriseWorkspace(database, workspaceId, userId, 'workspace-read')
      if (folderId !== undefined && !(await folderBelongsTo(database, workspaceId, folderId))) {
        throw new ProblemError('validation-failed', { errors: [invalidValue('/query/folderId')] })
      }

      const page = await listDocuments(database, {
        userId,
        workspaceId,
        archived,
        limit,
        ...(query === undefined ? {} : { query }),
        ...(folderId === undefined ? {} : { folderId }),
        ...(after === undefined ? {} : { after }),
      })
      return {
        items: page.records.map(presentReadable),
        nextCursor: page.next === null ? null : encodeCursor(page.next, filters),
      }
    }),
  )

  app.route(
    operationRoute(contract, 'createDocument', async (request, reply) => {
      const { userId } = principalOf(request)
      const { workspaceId } = request.params
      const { title, folderId, templateId, locale = 'en' } = request.body
      await authoriseWorkspace(database, workspaceId, userId, 'create-content')

      const errors: FieldError[] = []
      if (folderId !== undefined && folderId !== null && !(await folderBelongsTo(database, workspaceId, folderId))) {
        errors.push(invalidValue('/folderId'))
      }
      const template = templateId === undefined ? undefined : builtInTemplates.find(locale, templateId)
      if (templateId !== undefined && template === undefined) errors.push(invalidValue('/templateId'))
      if (errors.length > 0) throw new ProblemError('validation-failed', { errors })

      const documentId = await database
        .transaction()
        .execute((trx) =>
          createDocumentRows(trx, {
            workspaceId,
            title,
            folderId: folderId ?? null,
            createdBy: userId,
            ...(template === undefined ? {} : { state: template.state, excerpt: template.excerpt }),
          }),
        )
        .catch((error: unknown) => {
          throw folderWentAway(error)
        })
      return reply.code(201).send(present(await reload(documentId, userId)))
    }),
  )

  app.route(
    operationRoute(contract, 'getDocument', async (request): Promise<Schema<'Document'>> =>
      present(
        await authoriseDocument(database, request.params.documentId, principalOf(request).userId, 'read', {
          onArchived: true,
        }),
      ),
    ),
  )

  app.route(
    operationRoute(contract, 'duplicateDocument', async (request, reply) => {
      const { userId } = principalOf(request)
      const { documentId } = request.params
      const { title, folderId } = request.body
      const { record } = await authoriseDocument(database, documentId, userId, 'read', { onArchived: false })
      // Whoever can read a document belongs to its workspace, which lets every member create; the check stays here so
      // that a role the workspace matrix does not allow to create could never copy what it reads.
      await authoriseWorkspace(database, record.workspace_id, userId, 'create-content')

      if (
        folderId !== undefined &&
        folderId !== null &&
        !(await folderBelongsTo(database, record.workspace_id, folderId))
      ) {
        throw new ProblemError('validation-failed', { errors: [invalidValue('/folderId')] })
      }

      // The stored state, read in the transaction that writes the copy: a connection's unstored changes are not part
      // of it, and nothing here writes to the original.
      const copyId = await database
        .transaction()
        .execute(async (trx) => {
          const state = await readDocumentState(trx, documentId)
          // Deleted for good since it was checked: the answer is the one for an id that was never there.
          if (state === undefined) throw new ProblemError('not-found')
          const copy = copyOrConflict(state)
          return createDocumentRows(trx, {
            workspaceId: record.workspace_id,
            title,
            folderId: folderId === undefined ? record.folder_id : folderId,
            createdBy: userId,
            ...copy,
          })
        })
        .catch((error: unknown) => {
          throw folderWentAway(error)
        })
      return reply.code(201).send(present(await reload(copyId, userId)))
    }),
  )

  app.route(
    operationRoute(contract, 'updateDocument', async (request): Promise<Schema<'Document'>> => {
      const { userId } = principalOf(request)
      const { documentId } = request.params
      const { title, folderId, revision } = request.body
      const document = await authoriseDocument(database, documentId, userId, 'rename-move', { onArchived: false })
      const { record } = document

      if (
        folderId !== undefined &&
        folderId !== null &&
        !(await folderBelongsTo(database, record.workspace_id, folderId))
      ) {
        throw new ProblemError('validation-failed', { errors: [invalidValue('/folderId')] })
      }
      if (revision !== record.revision) throw revisionConflict(document)

      const events = metadataChanges({ title: record.title, folderId: record.folder_id }, { title, folderId })
      // Nothing to change is not a change: no revision, no event, and the document is returned as it is.
      if (events.length === 0) return present(document)

      const updated = await database
        .transaction()
        .execute((trx) =>
          updateMetadata(trx, {
            documentId,
            workspaceId: record.workspace_id,
            actorId: userId,
            revision,
            title,
            folderId,
            events,
          }),
        )
        .catch((error: unknown) => {
          throw folderWentAway(error)
        })
      // Told from what this request wrote, before the document is read again: that read may find the caller without access,
      // and the change is committed all the same.
      if (updated) {
        await afterCommit(request, 'telling the connections the document changed', async () =>
          broadcaster.broadcast(documentId, {
            type: 'metadata-changed',
            title: title ?? record.title,
            revision: revision + 1,
          }),
        )
      }
      const current = await reload(documentId, userId)
      // Someone else changed it between the read and the write: the write refused, and the caller is told what won.
      if (!updated) throw revisionConflict(current)
      return present(current)
    }),
  )

  app.route(
    operationRoute(contract, 'archiveDocument', async (request): Promise<Schema<'Document'>> => {
      const { userId } = principalOf(request)
      const { documentId } = request.params
      // Archiving is idempotent for those who may archive: an archived document is returned as it is, with no new
      // revision and no event, as restoring a live one is. Everyone else still gets the 404 of an archived document.
      const { record } = await authoriseDocument(database, documentId, userId, 'archive-delete', { onArchived: true })
      if (record.archived_at === null) {
        const archived = await database
          .transaction()
          .execute((trx) =>
            setArchived(trx, { documentId, workspaceId: record.workspace_id, actorId: userId, archive: true }),
          )
        if (archived) {
          await afterCommit(request, 'closing the connections of the archived document', () =>
            liveAccess.documentArchived(documentId),
          )
        }
      }
      return present(await reload(documentId, userId))
    }),
  )

  app.route(
    operationRoute(contract, 'restoreDocument', async (request): Promise<Schema<'Document'>> => {
      const { userId } = principalOf(request)
      const { documentId } = request.params
      const { record } = await authoriseDocument(database, documentId, userId, 'archive-delete', { onArchived: true })
      if (record.archived_at !== null) {
        const restored = await database
          .transaction()
          .execute((trx) =>
            setArchived(trx, { documentId, workspaceId: record.workspace_id, actorId: userId, archive: false }),
          )
        if (restored) {
          await afterCommit(request, 'recycling the connections of the restored document', () =>
            liveAccess.documentRestored(documentId),
          )
        }
      }
      return present(await reload(documentId, userId))
    }),
  )

  app.route(
    operationRoute(contract, 'deleteDocument', async (request, reply) => {
      const { documentId } = request.params
      const { record } = await authoriseDocument(database, documentId, principalOf(request).userId, 'archive-delete', {
        onArchived: true,
      })
      // Only what is in the archive can be deleted for good: a live document has to be archived first.
      if (record.archived_at === null || !(await deleteArchivedDocument(database, documentId))) {
        throw new ProblemError('conflict')
      }
      await afterCommit(request, 'closing the connections of the deleted document', () =>
        liveAccess.documentDeleted(documentId),
      )
      return reply.code(204).send()
    }),
  )

  done()
}
