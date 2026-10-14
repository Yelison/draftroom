import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import type { Database } from './tables.ts'

/**
 * A short wait for a connection, so a database that is down makes the readiness probe fail in seconds instead of
 * leaving the probe hanging.
 */
const connectionTimeoutMillis = 3_000

export function createDatabase(connectionString: string): Kysely<Database> {
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis })
  // An idle connection that the database drops emits `error` on the pool; unhandled, that would end the process.
  // The pool discards the connection and the next query opens a new one, which is where a real outage shows.
  pool.on('error', () => undefined)
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) })
}
