import type { Schema } from '@draftroom/contract'

/**
 * The events that reveal how a document is shared. Who has access, and since when, is the owners' to know (the matrix
 * gives "read and change access" to owners), so the same facts do not leave through the history: the owners of the
 * document are told of these events and nobody else is. A test holds this list to the contract's own.
 */
export const sharingActivity = [
  'access.granted',
  'access.changed',
  'access.revoked',
  'general-access.changed',
] as const satisfies readonly Schema<'ActivityType'>[]

/**
 * Whether PostgreSQL can hold the instant of a filter. The contract's format accepts a year 0000, which the calendar
 * does not have and the database refuses, so it has to be told apart before the query is made.
 */
export const isStorableInstant = (timestamp: string): boolean => !timestamp.startsWith('0000-')
