import { sql, type Kysely } from 'kysely'
import { sharingActivity } from '../domain/activity.ts'
import type { CursorPosition } from '../domain/pagination.ts'
import { memberDocuments, ownsDocument, readableDocument } from './documents/caller-documents.ts'
import { atOrAfter, atOrBefore, inMilliseconds, isBefore, millisecondKey } from './milliseconds.ts'
import type { ActivityType, Database } from './tables.ts'

// The history as a person is told it: the events of the documents they can read, at the moment they ask. The right to
// read is part of the query, before the page is cut, so a page is never short of the events the person may not see, and
// an event of a document whose access was taken away leaves the history with it. It is the rule of every other read of
// documents (`readableDocument`), not a copy of it.

/** A person an event names. `name` is `null` for a member who has not signed up, who can still be the target of a grant. */
export interface ActivityPerson {
  readonly id: string
  readonly name: string | null
  readonly email: string
}

export interface ActivityRecord {
  readonly id: string
  readonly type: ActivityType
  readonly createdAt: Date
  /** `null` when the server acted. */
  readonly actor: ActivityPerson | null
  readonly document: { readonly id: string; readonly title: string }
  readonly targetUser: ActivityPerson | null
  /** `created_at` cut to the millisecond, as PostgreSQL writes it: what a cursor holds. */
  readonly createdAtKey: string
}

export interface ActivitySearch {
  readonly userId: string
  readonly workspaceId: string
  readonly documentId?: string
  readonly actorId?: string
  /** At or after this instant. */
  readonly from?: string
  /** Before this instant. */
  readonly to?: string
  readonly after?: CursorPosition
  readonly limit: number
}

export interface ActivityPage {
  readonly records: readonly ActivityRecord[]
  /** Where the next page starts, or `null` on the last one. */
  readonly next: CursorPosition | null
}

const instant = (timestamp: string) => sql<Date>`${timestamp}::timestamptz`

/**
 * The query of a page of the history of the documents the person can read, newest first, ties by id, with one row more
 * than `limit`: that row says there is a next page. The events that reveal how a document is shared are only for the
 * owners of that document. Apart from `listActivity` so that a test can ask the database for its plan.
 */
export function activityPageQuery(db: Kysely<Database>, search: ActivitySearch) {
  let query = memberDocuments(db, search.userId)
    .innerJoin('activity_events as e', (join) =>
      join.onRef('e.workspace_id', '=', 'd.workspace_id').onRef('e.document_id', '=', 'd.id'),
    )
    .leftJoin('users as actor', 'actor.id', 'e.actor_id')
    .leftJoin('users as target', 'target.id', 'e.target_user_id')
    .select([
      'e.id',
      'e.type',
      'e.created_at',
      'd.id as documentId',
      'd.title as documentTitle',
      'actor.id as actorId',
      'actor.name as actorName',
      'actor.email as actorEmail',
      'target.id as targetId',
      'target.name as targetName',
      'target.email as targetEmail',
      millisecondKey('e.created_at').as('createdAtKey'),
    ])
    .where('d.workspace_id', '=', search.workspaceId)
    .where(readableDocument)
    .where((eb) => eb.or([eb('e.type', 'not in', [...sharingActivity]), ownsDocument(eb)]))
  if (search.documentId !== undefined) query = query.where('d.id', '=', search.documentId)
  if (search.actorId !== undefined) query = query.where('e.actor_id', '=', search.actorId)
  if (search.from !== undefined) {
    query = query.where('e.created_at', '>=', instant(search.from)).where(atOrAfter('e.created_at', search.from))
  }
  if (search.to !== undefined) {
    query = query.where('e.created_at', '<', instant(search.to)).where(atOrBefore('e.created_at', search.to))
  }
  if (search.after !== undefined) {
    query = query.where(isBefore('e.created_at', 'e.id', search.after))
  }

  return query
    .orderBy(inMilliseconds('e.created_at'), 'desc')
    .orderBy('e.id', 'desc')
    .limit(search.limit + 1)
}

/** A page of the history of the documents the person can read. */
export async function listActivity(db: Kysely<Database>, search: ActivitySearch): Promise<ActivityPage> {
  const rows = await activityPageQuery(db, search).execute()
  const records = rows.slice(0, search.limit).map((row): ActivityRecord => ({
    id: row.id,
    type: row.type,
    createdAt: row.created_at,
    createdAtKey: row.createdAtKey,
    document: { id: row.documentId, title: row.documentTitle },
    actor:
      row.actorId === null || row.actorEmail === null
        ? null
        : { id: row.actorId, name: row.actorName, email: row.actorEmail },
    targetUser:
      row.targetId === null || row.targetEmail === null
        ? null
        : { id: row.targetId, name: row.targetName, email: row.targetEmail },
  }))
  const last = records.at(-1)
  return {
    records,
    next: rows.length > search.limit && last !== undefined ? { timestamp: last.createdAtKey, id: last.id } : null,
  }
}
