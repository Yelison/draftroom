import type { Schema } from '@draftroom/contract'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/db/tables.ts'
import { apiOf, bodyAs, type Api } from './support/api.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import { createPerson } from './support/world.ts'

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
let api: Api
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  server = createTestApp(db)
  api = apiOf(server)
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

describe('listing the templates', () => {
  const list = async (query = '') =>
    api({ as: await createPerson(db, 'Marta Ibáñez'), method: 'GET', url: `/api/templates${query}` })

  it('answers in English by default, by id ascending', async () => {
    const { items } = bodyAs<Schema<'TemplateList'>>(await list())

    expect(items.map(({ id }) => id)).toEqual(['meeting-notes', 'project-brief', 'weekly-update'])
    expect(items[0]).toMatchObject({ name: 'Meeting notes' })
  })

  it('answers in the language asked for', async () => {
    const { items } = bodyAs<Schema<'TemplateList'>>(await list('?locale=es'))

    expect(items[0]).toMatchObject({ id: 'meeting-notes', name: 'Notas de reunión' })
  })

  it('refuses a language the contract does not have', async () => {
    expect((await list('?locale=fr')).statusCode).toBe(400)
  })
})
