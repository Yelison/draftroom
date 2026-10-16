import type { Kysely } from 'kysely'
import type { ActivityType, Database } from './tables.ts'

export interface ActivityEvent {
  readonly workspaceId: string
  readonly documentId: string
  readonly type: ActivityType
  /** `null` when the server acted. */
  readonly actorId: string | null
  /** The person an access change is about. */
  readonly targetUserId?: string
}

/** Appends an event to the history. Call it in the transaction of the change it describes, so neither exists alone. */
export async function recordActivity(db: Kysely<Database>, events: readonly ActivityEvent[]): Promise<void> {
  if (events.length === 0) return
  await db
    .insertInto('activity_events')
    .values(
      events.map((event) => ({
        workspace_id: event.workspaceId,
        document_id: event.documentId,
        type: event.type,
        actor_id: event.actorId,
        target_user_id: event.targetUserId ?? null,
      })),
    )
    .execute()
}
