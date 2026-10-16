/** What the collaboration server needs of a logger; Fastify's (pino) satisfies it, and so does a recorder in a test. */
export interface CollabLog {
  info(details: object, message: string): void
  warn(details: object, message: string): void
  error(details: object, message: string): void
}
