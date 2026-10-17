import { sql, type ExpressionBuilder, type Kysely, type SelectQueryBuilder } from 'kysely'
import { effectiveRole } from '../../domain/permissions.ts'
import type { CursorPosition } from '../../domain/pagination.ts'
import type { Database, DocumentRole, GeneralAccess, WorkspaceRole } from '../tables.ts'

// Every read of documents goes through one query: the documents of the workspaces a person belongs to, each with that
// person's own facts (their role in the workspace, their explicit grant, their pin). The role itself is never decided
// in SQL: `effectiveRole` does it, from those facts. The filters below only decide which rows come back, and they say
// what the domain says: a person can read a document when they own the workspace, hold a grant on it, or the document
// is open to the workspace; only an owner reads an archived one.

/** A document with the facts about the person who asked, which is all the permission rules need. */
export interface DocumentRecord {
  readonly id: string
  readonly workspace_id: string
  readonly folder_id: string | null
  readonly title: string
  readonly excerpt: string | null
  readonly revision: number
  readonly general_access: GeneralAccess
  readonly archived_at: Date | null
  readonly created_at: Date
  readonly updated_at: Date
  readonly creator: { readonly id: string; readonly name: string | null }
  readonly workspaceRole: WorkspaceRole
  readonly grant: DocumentRole | null
  readonly pinned: boolean
  /** `updated_at` as PostgreSQL writes it, microseconds included: what a cursor holds. */
  readonly updatedAtKey: string
}

// Written by PostgreSQL, in UTC, so a cursor does not depend on a time zone setting and keeps the microseconds.
const timestampKey = sql<string>`to_char(d.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

/**
 * The documents of the workspaces a person belongs to, each beside that person's membership (`m`) and their explicit
 * grant, if any (`g`). Nothing is selected: every read of documents, and of what hangs from them, starts here, so the
 * person's facts are joined the same way everywhere.
 */
export const memberDocuments = (db: Kysely<Database>, userId: string) =>
  db
    .selectFrom('documents as d')
    .innerJoin('memberships as m', (join) =>
      join.onRef('m.workspace_id', '=', 'd.workspace_id').on('m.user_id', '=', userId),
    )
    .leftJoin('document_access as g', (join) => join.onRef('g.document_id', '=', 'd.id').on('g.user_id', '=', userId))

type MemberDocuments = ReturnType<typeof memberDocuments>
type FactsBuilder = ExpressionBuilder<
  MemberDocuments extends SelectQueryBuilder<infer DB, infer _TB, infer _O> ? DB : never,
  'd' | 'm' | 'g'
>

function callerDocuments(db: Kysely<Database>, userId: string) {
  return memberDocuments(db, userId)
    .innerJoin('users as creator', 'creator.id', 'd.created_by')
    .leftJoin('pins as p', (join) => join.onRef('p.document_id', '=', 'd.id').on('p.user_id', '=', userId))
    .select([
      'd.id',
      'd.workspace_id',
      'd.folder_id',
      'd.title',
      'd.excerpt',
      'd.revision',
      'd.general_access',
      'd.archived_at',
      'd.created_at',
      'd.updated_at',
      'creator.id as creatorId',
      'creator.name as creatorName',
      'm.role as workspaceRole',
      'g.role as grant',
      sql<boolean>`p.user_id is not null`.as('pinned'),
      timestampKey.as('updatedAtKey'),
    ])
}

type CallerDocuments = ReturnType<typeof callerDocuments>
type Row = Awaited<ReturnType<CallerDocuments['executeTakeFirstOrThrow']>>

function toRecord({ creatorId, creatorName, ...row }: Row): DocumentRecord {
  return { ...row, creator: { id: creatorId, name: creatorName } }
}

/** The role the person has on the document, from the facts in the record. */
export const roleOf = (record: DocumentRecord): DocumentRole | null =>
  effectiveRole({ workspaceRole: record.workspaceRole, grant: record.grant, generalAccess: record.general_access })

/** Whether the person owns the document: they own its workspace or hold an `owner` grant on it. */
export const ownsDocument = (eb: FactsBuilder) => eb.or([eb('m.role', '=', 'owner'), eb('g.role', '=', 'owner')])

/** A person can read a live document when they own the workspace, hold a grant on it, or it is open to the workspace. */
export const readableDocument = (eb: FactsBuilder) =>
  eb.and([
    eb('d.archived_at', 'is', null),
    eb.or([eb('m.role', '=', 'owner'), eb('g.role', 'is not', null), eb('d.general_access', '<>', 'none')]),
  ])

/** The documents the person can read, archived ones left out. */
const readable = (query: CallerDocuments): CallerDocuments => query.where(readableDocument)

/** The archived documents the person owns: the only ones they can see. */
const archivedAndOwned = (query: CallerDocuments): CallerDocuments =>
  query.where('d.archived_at', 'is not', null).where(ownsDocument)

const newestFirst = (query: CallerDocuments): CallerDocuments =>
  query.orderBy('d.updated_at', 'desc').orderBy('d.id', 'desc')

/** The document with the person's facts, readable or not, or nothing when it does not exist or is not in their workspaces. */
export async function findDocumentFor(
  db: Kysely<Database>,
  documentId: string,
  userId: string,
): Promise<DocumentRecord | undefined> {
  const row = await callerDocuments(db, userId).where('d.id', '=', documentId).executeTakeFirst()
  return row === undefined ? undefined : toRecord(row)
}

/** A document with the person's facts, and the name they are known by: what a live connection needs, in one query. */
export interface DocumentAccess {
  readonly record: DocumentRecord
  /** `null` only for someone who has not signed up, who cannot be connected. */
  readonly personName: string | null
}

/** The same facts as {@link findDocumentFor}, plus the person's name, for the collaboration server's one query per connection. */
export async function findDocumentAccess(
  db: Kysely<Database>,
  documentId: string,
  userId: string,
): Promise<DocumentAccess | undefined> {
  const row = await callerDocuments(db, userId)
    .innerJoin('users as person', 'person.id', 'm.user_id')
    .select('person.name as personName')
    .where('d.id', '=', documentId)
    .executeTakeFirst()
  if (row === undefined) return undefined
  const { personName, ...documentRow } = row
  return { record: toRecord(documentRow), personName }
}

export interface DocumentSearch {
  readonly userId: string
  readonly workspaceId: string
  /** Text in the title or the excerpt, without regard to case. */
  readonly query?: string
  readonly folderId?: string
  /** The archived documents the person owns, instead of the live ones they can read. */
  readonly archived: boolean
  readonly after?: CursorPosition
  readonly limit: number
}

export interface DocumentPage {
  readonly records: readonly DocumentRecord[]
  /** Where the next page starts, or `null` on the last one. */
  readonly next: CursorPosition | null
}

/** A page of the person's documents, newest change first, ties by id. One row more than `limit` says there is a next page. */
export async function listDocuments(db: Kysely<Database>, search: DocumentSearch): Promise<DocumentPage> {
  let query = (search.archived ? archivedAndOwned : readable)(callerDocuments(db, search.userId)).where(
    'd.workspace_id',
    '=',
    search.workspaceId,
  )
  if (search.folderId !== undefined) query = query.where('d.folder_id', '=', search.folderId)
  if (search.query !== undefined) {
    // `strpos` and not LIKE: the text is the person's, and `%` and `_` in it must mean themselves. Parenthesised on
    // purpose: an `or` that is not would let the excerpt match skip every other condition of the query.
    const text = search.query
    query = query.where((eb) =>
      eb.or([
        eb(sql<number>`strpos(lower(d.title), lower(${text}))`, '>', 0),
        eb(sql<number>`strpos(lower(coalesce(d.excerpt, '')), lower(${text}))`, '>', 0),
      ]),
    )
  }
  if (search.after !== undefined) {
    const { timestamp, id } = search.after
    query = query.where(sql<boolean>`(d.updated_at, d.id) < (${timestamp}::timestamptz, ${id}::uuid)`)
  }

  const rows = await newestFirst(query)
    .limit(search.limit + 1)
    .execute()
  const records = rows.slice(0, search.limit).map(toRecord)
  const last = records.at(-1)
  return {
    records,
    next: rows.length > search.limit && last !== undefined ? { timestamp: last.updatedAtKey, id: last.id } : null,
  }
}

/** The documents the person pinned in a workspace that they can still read. */
export async function listPinned(db: Kysely<Database>, workspaceId: string, userId: string): Promise<DocumentRecord[]> {
  const rows = await newestFirst(readable(callerDocuments(db, userId)))
    .where('d.workspace_id', '=', workspaceId)
    .where('p.user_id', 'is not', null)
    .execute()
  return rows.map(toRecord)
}

/**
 * The documents a person can read and does not own: their workspace role is not owner and no grant of theirs is. What
 * is left is the readable ones the person was given a role on, which the caller narrows by the role it computes.
 */
export async function listSharedCandidates(
  db: Kysely<Database>,
  workspaceId: string,
  userId: string,
): Promise<DocumentRecord[]> {
  const rows = await newestFirst(readable(callerDocuments(db, userId)))
    .where('d.workspace_id', '=', workspaceId)
    .where('m.role', '=', 'member')
    .where((eb) => eb.or([eb('g.role', 'is', null), eb('g.role', '<>', 'owner')]))
    .execute()
  return rows.map(toRecord)
}
