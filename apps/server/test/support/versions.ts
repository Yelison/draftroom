import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { Database, VersionKind } from '../../src/db/tables.ts'

// Versions for the tests, inserted straight into the table, not through the routes under test.

export interface NewVersion {
  readonly workspaceId: string
  readonly documentId: string
  readonly kind?: VersionKind
  /** The person who made it; none for an automatic version, which the server makes. */
  readonly author?: { readonly id: string } | null
  readonly label?: string | null
  readonly state?: Uint8Array
  /** The instant it was made, as PostgreSQL would hold it. */
  readonly createdAt?: string
  readonly restoreId?: string
}

export async function createVersion(db: Kysely<Database>, version: NewVersion): Promise<string> {
  const kind = version.kind ?? 'manual'
  const { id } = await db
    .insertInto('document_versions')
    .values({
      workspace_id: version.workspaceId,
      document_id: version.documentId,
      kind,
      label: version.label ?? null,
      created_by: kind === 'auto' ? null : (version.author?.id ?? null),
      state: version.state ?? Uint8Array.of(0, 0),
      restore_id: version.restoreId ?? null,
      ...(version.createdAt === undefined ? {} : { created_at: sql`${version.createdAt}::timestamptz` }),
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return id
}

/** Every version of a document, oldest first, with the state they hold. */
export const versionsOf = (db: Kysely<Database>, documentId: string) =>
  db
    .selectFrom('document_versions')
    .select(['id', 'kind', 'label', 'created_by', 'restore_id', 'state'])
    .where('document_id', '=', documentId)
    .orderBy('created_at')
    .orderBy('id')
    .execute()
