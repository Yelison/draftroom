import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import { securityHeaders } from '../../src/http/security.ts'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'

// The collaboration port speaks WebSocket and nothing else: what it says to a plain request, which is the one thing a
// browser or a scanner can ask it without a session (ADR 0017).

let database: TestDatabase
let db: Kysely<Database>
let collab: CollabHarness
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  collab = await startCollab(db, { config: { nodeEnv: 'production' } })
})
afterAll(async () => {
  await collab.close()
  await database.drop()
})

const http = () => collab.url.replace('ws://', 'http://')

describe('a plain request to the collaboration port', () => {
  it.each(['GET', 'POST', 'OPTIONS'])('is a 404 with nothing in it, as a %s', async (method) => {
    const response = await fetch(http(), { method })

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('')
  })

  it('does not say what is running there', async () => {
    const response = await fetch(`${http()}/anything`)

    expect(await response.text()).not.toMatch(/hocuspocus/i)
  })

  it('carries the security headers of every answer of the API, HSTS included in production', async () => {
    const response = await fetch(http())

    for (const [name, value] of Object.entries(securityHeaders({ production: true }))) {
      expect(response.headers.get(name), name).toBe(value)
    }
  })
})
