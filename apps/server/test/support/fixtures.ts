import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { Database, WorkspaceRole } from '../../src/db/tables.ts'

// Rows for the tests of the schema, inserted through Kysely so the table types are exercised too.

export async function createUser(db: Kysely<Database>, name: string | null = 'Marta Ruiz'): Promise<string> {
  const { id } = await db
    .insertInto('users')
    .values({
      email: `${randomUUID()}@harborpine.example`,
      name,
      signed_up_at: name === null ? null : new Date(),
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return id
}

export async function createWorkspace(db: Kysely<Database>): Promise<string> {
  const { id } = await db
    .insertInto('workspaces')
    .values({ name: 'Harbor Pine' })
    .returning('id')
    .executeTakeFirstOrThrow()
  return id
}

export async function addMember(
  db: Kysely<Database>,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole = 'member',
): Promise<void> {
  await db.insertInto('memberships').values({ workspace_id: workspaceId, user_id: userId, role }).execute()
}

export async function createFolder(db: Kysely<Database>, workspaceId: string): Promise<string> {
  const { id } = await db
    .insertInto('folders')
    .values({ workspace_id: workspaceId, name: 'Launch' })
    .returning('id')
    .executeTakeFirstOrThrow()
  return id
}

export async function createDocument(
  db: Kysely<Database>,
  document: { workspaceId: string; createdBy: string; folderId?: string },
): Promise<string> {
  const { id } = await db
    .insertInto('documents')
    .values({
      workspace_id: document.workspaceId,
      created_by: document.createdBy,
      folder_id: document.folderId ?? null,
      title: 'Autumn launch plan',
      archived_at: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return id
}

/** A workspace with one member who created a folder and a document in it. */
export interface Workspace {
  readonly id: string
  readonly userId: string
  readonly folderId: string
  readonly documentId: string
}

export async function createPopulatedWorkspace(db: Kysely<Database>): Promise<Workspace> {
  const id = await createWorkspace(db)
  const userId = await createUser(db)
  await addMember(db, id, userId, 'owner')
  const folderId = await createFolder(db, id)
  const documentId = await createDocument(db, { workspaceId: id, createdBy: userId, folderId })
  return { id, userId, folderId, documentId }
}
