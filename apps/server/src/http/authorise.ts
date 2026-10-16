import type { Kysely } from 'kysely'
import { findComment, findThread, type CommentLocation, type ThreadLocation } from '../db/comments/queries.ts'
import { findDocumentFor, roleOf, type DocumentRecord } from '../db/documents/caller-documents.ts'
import { folderOfMember, type FolderRow } from '../db/folders.ts'
import type { Database, DocumentRole } from '../db/tables.ts'
import { workspaceOf, type WorkspaceOfMember } from '../db/workspaces.ts'
import { canInWorkspace, verdictFor, type DocumentOperation, type WorkspaceOperation } from '../domain/permissions.ts'
import { ProblemError } from './problem.ts'

// Steps 4 and 5 of the order of checks, once for every route: find the resource and the caller's right to read it
// (404), then the caller's role (403). A route calls one of these first and goes on only with what comes back, so no
// route can decide for itself.

export interface AuthorisedDocument {
  readonly record: DocumentRecord
  readonly role: DocumentRole
}

export interface DocumentAccessOptions {
  /** The operation still applies to an archived document: reading it, restoring it, deleting it. */
  readonly onArchived: boolean
}

export async function authoriseDocument(
  database: Kysely<Database>,
  documentId: string,
  userId: string,
  operation: DocumentOperation,
  options: DocumentAccessOptions,
): Promise<AuthorisedDocument> {
  const record = await findDocumentFor(database, documentId, userId)
  // A document that is not there and one the person may not read are the same answer, built from the same code path.
  if (record === undefined) throw new ProblemError('not-found')
  const role = roleOf(record)
  const verdict = verdictFor({ role, archived: record.archived_at !== null }, operation, options)
  if (verdict === 'not-found' || role === null) throw new ProblemError('not-found')
  if (verdict === 'forbidden') throw new ProblemError('forbidden')
  return { record, role }
}

export async function authoriseWorkspace(
  database: Kysely<Database>,
  workspaceId: string,
  userId: string,
  operation: WorkspaceOperation,
): Promise<WorkspaceOfMember> {
  const workspace = await workspaceOf(database, workspaceId, userId)
  if (workspace === undefined) throw new ProblemError('not-found')
  if (!canInWorkspace(workspace.role, operation)) throw new ProblemError('forbidden')
  return workspace
}

export interface AuthorisedFolder {
  readonly folder: FolderRow
  readonly workspaceRole: WorkspaceOfMember['role']
}

export async function authoriseFolder(
  database: Kysely<Database>,
  folderId: string,
  userId: string,
  operation: WorkspaceOperation,
): Promise<AuthorisedFolder> {
  const found = await folderOfMember(database, folderId, userId)
  if (found === undefined) throw new ProblemError('not-found')
  if (!canInWorkspace(found.workspaceRole, operation)) throw new ProblemError('forbidden')
  return found
}

export interface AuthorisedThread {
  readonly thread: ThreadLocation
  /** The document the thread belongs to, as the caller sees it. */
  readonly document: AuthorisedDocument
}

/**
 * Steps 4 and 5 for a thread named by its id: the thread is the caller's to know about exactly when its document is, and
 * a thread of an archived document is as hidden as the document, so `onArchived` is never set. The id of a thread that
 * does not exist, of one in another workspace and of one in a document the caller cannot read all answer alike.
 */
export async function authoriseThread(
  database: Kysely<Database>,
  threadId: string,
  userId: string,
  operation: DocumentOperation,
): Promise<AuthorisedThread> {
  const thread = await findThread(database, threadId)
  if (thread === undefined) throw new ProblemError('not-found')
  return {
    thread,
    document: await authoriseDocument(database, thread.document_id, userId, operation, { onArchived: false }),
  }
}

export interface AuthorisedComment {
  readonly comment: CommentLocation
  readonly document: AuthorisedDocument
}

/**
 * The same for a comment named by its id, up to the right to read it: whether the caller may then change it depends on
 * who wrote it, which the route asks the domain (`commentVerdict`) once it has the comment.
 */
export async function authoriseComment(
  database: Kysely<Database>,
  commentId: string,
  userId: string,
): Promise<AuthorisedComment> {
  const comment = await findComment(database, commentId)
  if (comment === undefined) throw new ProblemError('not-found')
  return {
    comment,
    document: await authoriseDocument(database, comment.document_id, userId, 'read-comments', { onArchived: false }),
  }
}
