import type { Schema } from '@draftroom/contract'
import type { ActivityRecord } from './fixtures/collaboration.ts'
import type { World } from './world.ts'

type ActivityType = Schema<'ActivityType'>

/** The events that reveal how a document is shared: only its owners are told about them. */
export const sharingEvents: ReadonlySet<ActivityType> = new Set([
  'access.granted',
  'access.changed',
  'access.revoked',
  'general-access.changed',
])

/** Writes down what someone did to a document, at the instant it happened. */
export function record(
  world: World,
  type: ActivityType,
  actorId: string,
  documentId: string,
  targetUserId: string | null = null,
): ActivityRecord {
  const event = { id: world.newId(), type, createdAt: world.now(), actorId, documentId, targetUserId }
  world.activity.push(event)
  return event
}
