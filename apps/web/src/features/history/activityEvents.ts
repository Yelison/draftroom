import type { Schema } from '@draftroom/contract'

export type ActivityEvent = Schema<'ActivityEvent'>

/** The events only the owners of a document receive: who can open it, which is what the "Access" label stands for. */
const accessEventTypes: ReadonlySet<ActivityEvent['type']> = new Set([
  'access.granted',
  'access.changed',
  'access.revoked',
  'general-access.changed',
])

export const isAccessEvent = (event: ActivityEvent): boolean => accessEventTypes.has(event.type)
