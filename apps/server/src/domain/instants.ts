/**
 * Whether PostgreSQL can hold the instant. The contract's format accepts a year 0000, which the calendar does not have
 * and the database refuses, so every list that is paginated or filtered by an instant has to tell it apart before the
 * query is made: it is a request that is not valid, and not a failure of the server.
 */
export const isStorableInstant = (timestamp: string): boolean => !timestamp.startsWith('0000-')
