import { sql } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createDatabase } from '../src/db/database.ts'
import { provisionDatabase, unreachableDatabaseUrl, type TestDatabase } from './support/postgres.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'

const notReady = {
  type: '/problems/unavailable',
  title: 'The server is not ready.',
  status: 503,
  code: 'unavailable',
}

describe('the health routes on a migrated database', () => {
  let database: TestDatabase
  let server: TestApp
  beforeAll(async () => {
    database = await provisionDatabase()
    server = createTestApp(database.db)
  })
  afterAll(async () => {
    await server.app.close()
    await database.drop()
  })

  it('answer live with 200', async () => {
    const response = await server.request({ method: 'GET', url: '/api/health/live' })

    expect(response).toMatchObject({ operationId: 'getLiveness', statusCode: 200, body: { status: 'ok' } })
  })

  it('answer ready with 200 when the database is up and the migrations are current', async () => {
    const response = await server.request({ method: 'GET', url: '/api/health/ready' })

    expect(response).toMatchObject({
      operationId: 'getReadiness',
      statusCode: 200,
      body: { status: 'ok', database: 'up', migrations: 'current' },
    })
  })
})

describe('the health routes on a database that cannot serve', () => {
  const opened: TestApp[] = []
  const databases: TestDatabase[] = []
  afterEach(async () => {
    await Promise.all(opened.splice(0).map((server) => server.app.close()))
    await Promise.all(databases.splice(0).map((database) => database.drop()))
  })

  it('answer ready with 503 while the migrations are pending', async () => {
    const empty = await provisionDatabase({ migrated: false })
    databases.push(empty)
    const server = createTestApp(empty.db)
    opened.push(server)

    const response = await server.request({ method: 'GET', url: '/api/health/ready' })

    expect(response).toMatchObject({ statusCode: 503, body: notReady })
  })

  it('answer ready with 503 when the database has migrations this server does not know', async () => {
    const newer = await provisionDatabase()
    databases.push(newer)
    await sql`insert into kysely_migration (name, timestamp) values ('0002_from_a_newer_server', now()::text)`.execute(
      newer.db,
    )
    const server = createTestApp(newer.db)
    opened.push(server)

    const response = await server.request({ method: 'GET', url: '/api/health/ready' })

    expect(response).toMatchObject({ statusCode: 503, body: notReady })
  })

  it('answer ready with 503, and live with 200, when the database is down', async () => {
    const down = createDatabase(unreachableDatabaseUrl)
    const server = createTestApp(down)
    opened.push(server)

    expect(await server.request({ method: 'GET', url: '/api/health/ready' })).toMatchObject({
      statusCode: 503,
      body: notReady,
    })
    expect(await server.request({ method: 'GET', url: '/api/health/live' })).toMatchObject({ statusCode: 200 })
    await down.destroy()
  })
})
