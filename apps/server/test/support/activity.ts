import { sql, type Kysely } from 'kysely'
import type { ActivityType, Database } from '../../src/db/tables.ts'

// Events of the history for the tests, inserted straight into the table, not through the routes that write them: the
// moment of each is the test's to choose, which is what ordering and paging need.

export interface NewEvent {
  readonly workspaceId: string
  readonly documentId: string
  readonly type?: ActivityType
  /** `null` for an event of the server. */
  readonly actor?: { readonly id: string } | null
  readonly target?: { readonly id: string }
  /** An instant as PostgreSQL reads it, microseconds included; the moment of the insert when left out. */
  readonly createdAt?: string
}

export async function recordEvent(db: Kysely<Database>, event: NewEvent): Promise<string> {
  const { id } = await db
    .insertInto('activity_events')
    .values({
      workspace_id: event.workspaceId,
      document_id: event.documentId,
      type: event.type ?? 'document.renamed',
      actor_id: event.actor?.id ?? null,
      target_user_id: event.target?.id ?? null,
      ...(event.createdAt === undefined ? {} : { created_at: sql<Date>`${event.createdAt}::timestamptz` }),
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return id
}

/** `count` events that share one instant, which is what a bulk change of a document leaves behind. */
export async function recordEventsAt(
  db: Kysely<Database>,
  count: number,
  event: Omit<NewEvent, 'createdAt'> & { readonly createdAt: string },
): Promise<string[]> {
  const ids: string[] = []
  for (let index = 0; index < count; index++) ids.push(await recordEvent(db, event))
  return ids
}
