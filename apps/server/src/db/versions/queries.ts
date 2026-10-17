import { sql, type Kysely } from 'kysely'
import type { CursorPosition } from '../../domain/pagination.ts'
import type { PersonRef } from '../comments/queries.ts'
import type { Database, VersionKind } from '../tables.ts'

// The reads of versions. A version comes with the name of the person who saved it and the size of what it holds, which is
// the shape the contract serves, and never with the state itself: that is read on its own, for the one version asked for.
// Whether the caller may read the document a version belongs to is decided before, from the location these give.

export interface VersionRecord {
  readonly id: string
  readonly workspace_id: string
  readonly document_id: string
  readonly kind: VersionKind
  readonly label: string | null
  readonly created_at: Date
  readonly size_bytes: number
  /** `null` when the server made it on its own. */
  readonly creator: PersonRef | null
  /** `created_at` as PostgreSQL writes it, microseconds included: what a cursor holds. */
  readonly createdAtKey: string
}

/** Where a version lives: enough to ask whether the caller may read its document. */
export interface VersionLocation {
  readonly id: string
  readonly workspace_id: string
  readonly document_id: string
  readonly kind: VersionKind
}

// Written by PostgreSQL, in UTC, so a cursor does not depend on a time zone setting and keeps the microseconds.
const timestampKey = sql<string>`to_char(v.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

function versionsQuery(db: Kysely<Database>) {
  return db
    .selectFrom('document_versions as v')
    .leftJoin('users as creator', 'creator.id', 'v.created_by')
    .select([
      'v.id',
      'v.workspace_id',
      'v.document_id',
      'v.kind',
      'v.label',
      'v.created_at',
      sql<number>`octet_length(v.state)`.as('size_bytes'),
      'creator.id as creatorId',
      'creator.name as creatorName',
      timestampKey.as('createdAtKey'),
    ])
}

type Row = Awaited<ReturnType<ReturnType<typeof versionsQuery>['executeTakeFirstOrThrow']>>

function toRecord({ creatorId, creatorName, ...row }: Row): VersionRecord {
  return { ...row, creator: creatorId === null ? null : { id: creatorId, name: creatorName } }
}

/** The version with the person who saved it, or nothing when it does not exist. */
export async function getVersion(db: Kysely<Database>, versionId: string): Promise<VersionRecord | undefined> {
  const row = await versionsQuery(db).where('v.id', '=', versionId).executeTakeFirst()
  return row === undefined ? undefined : toRecord(row)
}

/** The version, wherever it is, or nothing when it does not exist. It says nothing of whether anyone may read it. */
export function findVersion(db: Kysely<Database>, versionId: string): Promise<VersionLocation | undefined> {
  return db
    .selectFrom('document_versions')
    .select(['id', 'workspace_id', 'document_id', 'kind'])
    .where('id', '=', versionId)
    .executeTakeFirst()
}

export interface VersionSearch {
  readonly workspaceId: string
  readonly documentId: string
  readonly limit: number
  readonly after?: CursorPosition
}

export interface VersionPage {
  readonly records: readonly VersionRecord[]
  /** Where the next page starts, or `null` at the end. */
  readonly next: CursorPosition | null
}

/** The versions of a document, newest first, a page at a time. */
export async function listVersions(db: Kysely<Database>, search: VersionSearch): Promise<VersionPage> {
  let query = versionsQuery(db)
    .where('v.workspace_id', '=', search.workspaceId)
    .where('v.document_id', '=', search.documentId)
  if (search.after !== undefined) {
    const { timestamp, id } = search.after
    query = query.where(sql<boolean>`(v.created_at, v.id) < (${timestamp}::timestamptz, ${id}::uuid)`)
  }
  const rows = await query
    .orderBy('v.created_at', 'desc')
    .orderBy('v.id', 'desc')
    .limit(search.limit + 1)
    .execute()
  const records = rows.slice(0, search.limit).map(toRecord)
  const last = records.at(-1)
  return {
    records,
    next: rows.length > search.limit && last !== undefined ? { timestamp: last.createdAtKey, id: last.id } : null,
  }
}

/** The Yjs update a version holds, or nothing when it does not exist. */
export async function readVersionState(db: Kysely<Database>, versionId: string): Promise<Uint8Array | undefined> {
  const row = await db.selectFrom('document_versions').select('state').where('id', '=', versionId).executeTakeFirst()
  return row?.state
}

/**
 * The newest version of a document of any kind, with the state it holds, or nothing when it has none. The workspace is
 * part of the question because the index of the table starts with it: without it every version of every workspace is read.
 */
export async function newestVersionState(
  db: Kysely<Database>,
  workspaceId: string,
  documentId: string,
): Promise<Uint8Array | undefined> {
  const row = await db
    .selectFrom('document_versions')
    .select('state')
    .where('workspace_id', '=', workspaceId)
    .where('document_id', '=', documentId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst()
  return row?.state
}

/** When the newest automatic version of a document was made, or `null` when there is none. */
export async function newestAutoVersionAt(
  db: Kysely<Database>,
  workspaceId: string,
  documentId: string,
): Promise<Date | null> {
  const row = await db
    .selectFrom('document_versions')
    .select(sql<Date | null>`max(created_at)`.as('at'))
    .where('workspace_id', '=', workspaceId)
    .where('document_id', '=', documentId)
    .where('kind', '=', 'auto')
    .executeTakeFirstOrThrow()
  return row.at
}
