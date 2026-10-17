import type { Schema } from '@draftroom/contract'
import type { DocumentRecord } from './fixtures/documents.ts'
import type { PersonRecord } from './fixtures/people.ts'
import type { WorkspaceRecord } from './fixtures/workspaces.ts'
import { forbidden, notFound, unauthenticated } from './problems.ts'
import { atLeast, documentRole, workspaceRole } from './roles.ts'
import type { World } from './world.ts'

/** Who is signed in on one connection to the mock. Several can share a world, each with a session of its own. */
export interface Session {
  userId: string | null
}

export interface Context {
  world: World
  session: Session
  /** Gives a new document the content it starts with, on the collaboration server that serves it: a template's text. */
  startContent: (documentId: string, update: Uint8Array) => void
  /** The live text of a document, on the collaboration server that serves it, which is what a version keeps. */
  live: {
    /** The document as it is now, as the Yjs update a version stores. */
    state: (documentId: string) => Uint8Array
    /** Makes the live text what an update holds, for everyone who has the document open (the restore of a version). */
    replace: (documentId: string, update: Uint8Array) => void
  }
}

type DocumentRole = Schema<'DocumentRole'>
type WorkspaceRole = Schema<'WorkspaceRole'>

// The checks every operation makes, in the order the contract fixes: the session (`401`), then the resource the caller
// may read (`404`, the same for a missing one and a forbidden one), then the role (`403`). The shape of the request
// goes between the first two, so operations validate their texts right after calling `caller`.

export function caller({ world, session }: Context): PersonRecord {
  const person = world.people.find((row) => row.id === session.userId)
  if (person === undefined) throw unauthenticated()
  return person
}

export function workspaceOf(ctx: Context, workspaceId: string): { workspace: WorkspaceRecord; role: WorkspaceRole } {
  const user = caller(ctx)
  const workspace = ctx.world.workspaces.find((row) => row.id === workspaceId)
  const role = workspace === undefined ? undefined : workspaceRole(ctx.world, user.id, workspace.id)
  if (workspace === undefined || role === undefined) throw notFound()
  return { workspace, role }
}

/**
 * A document the caller can read. An archived one is readable by its owners alone, and only the operations that deal
 * with archiving pass `archived: 'allow'`: everything else about it is `404`, as the contract says.
 */
export function documentOf(
  ctx: Context,
  documentId: string,
  { archived }: { archived?: 'allow' } = {},
): { document: DocumentRecord; role: DocumentRole } {
  const user = caller(ctx)
  const document = ctx.world.documents.find((row) => row.id === documentId)
  const role = document === undefined ? undefined : documentRole(ctx.world, user.id, document)
  if (document === undefined || role === undefined || (document.archivedAt !== null && archived !== 'allow')) {
    throw notFound()
  }
  return { document, role }
}

/** `403` when the caller can read the resource but their role is below what the operation needs. */
export function requireRole(role: DocumentRole, minimum: DocumentRole): void {
  if (!atLeast(role, minimum)) throw forbidden()
}

export function requireWorkspaceOwner(role: WorkspaceRole): void {
  if (role !== 'owner') throw forbidden()
}
