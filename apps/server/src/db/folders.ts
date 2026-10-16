import { sql, type Kysely, type Selectable } from 'kysely'
import type { Database, FoldersTable, WorkspaceRole } from './tables.ts'

export type FolderRow = Selectable<FoldersTable>

/** A folder, and the role in its workspace of the person who asked for it. */
export interface FolderOfMember {
  readonly folder: FolderRow
  readonly workspaceRole: WorkspaceRole
}

const foreignKeyViolation = '23503'

/**
 * Whether an error from PostgreSQL is a foreign key refusing a row, which is how a race with another request ends. With
 * a `constraint`, only that one: a refusal from another foreign key is not the race the caller is waiting for.
 */
export const isForeignKeyViolation = (error: unknown, constraint?: string): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === foreignKeyViolation &&
  (constraint === undefined || ('constraint' in error && error.constraint === constraint))

export function listFolders(db: Kysely<Database>, workspaceId: string): Promise<FolderRow[]> {
  return db
    .selectFrom('folders')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .orderBy('name')
    .orderBy('id')
    .execute()
}

/** The folder, or nothing when it does not exist or its workspace is not the person's. */
export async function folderOfMember(
  db: Kysely<Database>,
  folderId: string,
  userId: string,
): Promise<FolderOfMember | undefined> {
  const row = await db
    .selectFrom('folders as f')
    .innerJoin('memberships as m', (join) =>
      join.onRef('m.workspace_id', '=', 'f.workspace_id').on('m.user_id', '=', userId),
    )
    .selectAll('f')
    .select('m.role as workspaceRole')
    .where('f.id', '=', folderId)
    .executeTakeFirst()
  if (row === undefined) return undefined
  const { workspaceRole, ...folder } = row
  return { folder, workspaceRole }
}

export function folderBelongsTo(db: Kysely<Database>, workspaceId: string, folderId: string): Promise<boolean> {
  return db
    .selectFrom('folders')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', folderId)
    .executeTakeFirst()
    .then((row) => row !== undefined)
}

export function insertFolder(db: Kysely<Database>, workspaceId: string, name: string): Promise<FolderRow> {
  return db.insertInto('folders').values({ workspace_id: workspaceId, name }).returningAll().executeTakeFirstOrThrow()
}

/** Renames a folder if it still has the revision the caller read: the check and the write are one statement. */
export function renameFolder(
  db: Kysely<Database>,
  folderId: string,
  name: string,
  revision: number,
): Promise<FolderRow | undefined> {
  return db
    .updateTable('folders')
    .set((eb) => ({ name, revision: eb('revision', '+', 1), updated_at: sql`now()` }))
    .where('id', '=', folderId)
    .where('revision', '=', revision)
    .returningAll()
    .executeTakeFirst()
}

/** Deletes a folder, or reports that something still holds documents in it: the database is what says so. */
export async function deleteFolder(db: Kysely<Database>, folderId: string): Promise<'deleted' | 'not-empty'> {
  try {
    await db.deleteFrom('folders').where('id', '=', folderId).execute()
    return 'deleted'
  } catch (error) {
    if (isForeignKeyViolation(error)) return 'not-empty'
    throw error
  }
}
