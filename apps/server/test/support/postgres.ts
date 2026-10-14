import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Kysely } from 'kysely'
import { inject } from 'vitest'
import { parse } from 'yaml'
import { z } from 'zod'
import pg from 'pg'
import { createDatabase } from '../../src/db/database.ts'
import type { Database } from '../../src/db/tables.ts'

declare module 'vitest' {
  export interface ProvidedContext {
    /** The PostgreSQL the whole run shares, with a migrated template database and nothing else in it. */
    postgresAdminUrl: string
  }
}

export const templateName = 'draftroom_template'

const composeFile = new URL('../../../../docker-compose.yml', import.meta.url)

/** The image Compose runs for development, so the tests exercise the same PostgreSQL. */
export function postgresImage(): string {
  const compose = z.object({ services: z.object({ postgres: z.object({ image: z.string() }) }) })
  return compose.parse(parse(readFileSync(composeFile, 'utf8'))).services.postgres.image
}

export function urlOfDatabase(adminUrl: string, name: string): string {
  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  return url.toString()
}

/** CREATE DATABASE from one template cannot run twice at once, and test files start together. */
const creationLock = 4_242

/** Creates a database named `name` on the shared server, a copy of the migrated template or an empty one. */
export async function createDatabaseNamed(adminUrl: string, name: string, template?: string): Promise<void> {
  const admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  try {
    // A session lock: it is released when this connection ends.
    await admin.query('select pg_advisory_lock($1)', [creationLock])
    // Identifiers cannot be parameters; both come from this module, never from input.
    await admin.query(`create database "${name}"${template === undefined ? '' : ` template "${template}"`}`)
  } finally {
    await admin.end()
  }
}

export interface TestDatabase {
  readonly db: Kysely<Database>
  readonly url: string
  /** Closes the connections and drops the database. */
  drop(): Promise<void>
}

/**
 * A database of its own for one test file, so files run in parallel without seeing each other's rows. By default it is
 * the template, already migrated; `migrated: false` gives an empty one, for the tests of the migrations themselves.
 */
export async function provisionDatabase({ migrated = true }: { migrated?: boolean } = {}): Promise<TestDatabase> {
  const adminUrl = inject('postgresAdminUrl')
  const name = `test_${randomUUID().replaceAll('-', '')}`
  await createDatabaseNamed(adminUrl, name, migrated ? templateName : undefined)

  const url = urlOfDatabase(adminUrl, name)
  const db = createDatabase(url)
  return {
    db,
    url,
    async drop() {
      await db.destroy()
      const admin = new pg.Client({ connectionString: adminUrl })
      await admin.connect()
      try {
        await admin.query(`drop database if exists "${name}" with (force)`)
      } finally {
        await admin.end()
      }
    },
  }
}

/** An address where nothing listens, for the tests of a database that is down. */
export const unreachableDatabaseUrl = 'postgres://draftroom:draftroom@127.0.0.1:1/draftroom'
