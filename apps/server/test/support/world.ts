import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { Database, DocumentRole, GeneralAccess, WorkspaceRole } from '../../src/db/tables.ts'

// Rows for the tests of the API: people who can be named in the `X-Dev-User` header, workspaces they belong to, and
// documents shared in every way there is. Inserted straight into the tables, not through the routes under test.

export interface Person {
  readonly id: string
  readonly email: string
  readonly name: string
}

/** Someone added by email who has not signed up: an address and an id, and no name. */
export interface PendingPerson {
  readonly id: string
  readonly email: string
  readonly name: null
}

export async function createPerson(db: Kysely<Database>, name: string): Promise<Person> {
  const email = `${randomUUID()}@harborpine.example`
  const { id } = await db
    .insertInto('users')
    .values({ email, name, signed_up_at: new Date() })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { id, email, name }
}

/** Someone added to a workspace by email who has not signed up yet: no name, and nobody who can be calling. */
export async function createPendingPerson(db: Kysely<Database>): Promise<PendingPerson> {
  const email = `${randomUUID()}@harborpine.example`
  const { id } = await db.insertInto('users').values({ email, name: null }).returning('id').executeTakeFirstOrThrow()
  return { id, email, name: null }
}

export async function createWorkspace(db: Kysely<Database>, name = 'Harbor & Pine'): Promise<string> {
  const { id } = await db.insertInto('workspaces').values({ name }).returning('id').executeTakeFirstOrThrow()
  return id
}

export async function join(
  db: Kysely<Database>,
  workspaceId: string,
  person: { readonly id: string },
  role: WorkspaceRole = 'member',
): Promise<void> {
  await db.insertInto('memberships').values({ workspace_id: workspaceId, user_id: person.id, role }).execute()
}

export async function createFolder(db: Kysely<Database>, workspaceId: string, name = 'Launch'): Promise<string> {
  const { id } = await db
    .insertInto('folders')
    .values({ workspace_id: workspaceId, name })
    .returning('id')
    .executeTakeFirstOrThrow()
  return id
}

export interface NewDocument {
  readonly workspaceId: string
  /** Gets the explicit `owner` grant, as the creator of a document does. */
  readonly creator: Person
  readonly title?: string
  readonly excerpt?: string | null
  readonly folderId?: string | null
  readonly generalAccess?: GeneralAccess
  readonly archived?: boolean
  readonly updatedAt?: Date | string
}

export async function createDocument(db: Kysely<Database>, document: NewDocument): Promise<string> {
  const { id } = await db
    .insertInto('documents')
    .values({
      workspace_id: document.workspaceId,
      created_by: document.creator.id,
      title: document.title ?? 'Autumn launch plan',
      excerpt: document.excerpt ?? null,
      folder_id: document.folderId ?? null,
      general_access: document.generalAccess ?? 'none',
      archived_at: document.archived === true ? new Date() : null,
      ...(document.updatedAt === undefined ? {} : { updated_at: new Date(document.updatedAt) }),
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await db
    .insertInto('document_states')
    .values({ workspace_id: document.workspaceId, document_id: id, state: Uint8Array.of(0, 0) })
    .execute()
  await grant(db, { workspaceId: document.workspaceId, documentId: id, person: document.creator, role: 'owner' })
  return id
}

export async function grant(
  db: Kysely<Database>,
  access: { workspaceId: string; documentId: string; person: Person; role: DocumentRole },
): Promise<void> {
  await db
    .insertInto('document_access')
    .values({
      workspace_id: access.workspaceId,
      document_id: access.documentId,
      user_id: access.person.id,
      role: access.role,
    })
    .execute()
}

/** A workspace with an owner and a document they created: the common start of a test. */
export interface Studio {
  readonly workspaceId: string
  readonly owner: Person
  readonly documentId: string
}

export async function createStudio(db: Kysely<Database>): Promise<Studio> {
  const workspaceId = await createWorkspace(db)
  const owner = await createPerson(db, 'Marta Ruiz')
  await join(db, workspaceId, owner, 'owner')
  const documentId = await createDocument(db, { workspaceId, creator: owner })
  return { workspaceId, owner, documentId }
}
