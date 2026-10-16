import type { Schema } from '@draftroom/contract'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { almazara, harborAndPine, people } from '../src/db/demo-seed/content.ts'
import { seedDemo } from '../src/db/demo-seed/seed.ts'
import { apiOf, bodyAs, type Api } from './support/api.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import type { Person } from './support/world.ts'

let database: TestDatabase
let server: TestApp
let api: Api
beforeAll(async () => {
  database = await provisionDatabase()
  server = createTestApp(database.db)
  api = apiOf(server)
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

describe('the demo seed', () => {
  it('fills an empty database, and does nothing the second time', async () => {
    expect(await seedDemo(database.db)).toBe(true)
    const count = async () =>
      (await database.db.selectFrom('documents').select('id').execute()).length +
      (await database.db.selectFrom('users').select('id').execute()).length

    const first = await count()

    expect(await seedDemo(database.db)).toBe(false)
    expect(await count()).toBe(first)
  })

  it('has one workspace in English and one in Spanish, each served to its people', async () => {
    const asMarta = await api({ as: people.marta, method: 'GET', url: '/api/workspaces' })
    const asLucia = await api({ as: people.lucia, method: 'GET', url: '/api/workspaces' })

    expect(
      bodyAs<Schema<'WorkspaceList'>>(asMarta)
        .items.map((workspace) => workspace.name)
        .sort(),
    ).toEqual([almazara.name, harborAndPine.name].sort())
    expect(bodyAs<Schema<'WorkspaceList'>>(asLucia).items.map((workspace) => workspace.name)).toEqual([almazara.name])
  })

  it.each([
    [harborAndPine, people.daniel, 'Autumn launch plan'],
    [almazara, people.mateo, 'Plan de la cosecha de otoño'],
  ])('gives the people of %s their documents, as their sharing says', async (workspace, person, title) => {
    const response = await api({ as: person, method: 'GET', url: `/api/workspaces/${workspace.id}/documents` })

    const titles = bodyAs<Schema<'DocumentPage'>>(response).items.map((document) => document.title)
    expect(titles).toContain(title)
    // The archive is not part of the live list.
    expect(titles).not.toContain(workspace.documents.find((document) => document.archived === true)?.title)
  })

  it('keeps what is private to one person from the others, and gives the workspace owner everything', async () => {
    const privateTitle = 'Interview questions for the design role'
    const list = (as: Person) =>
      api({
        as,
        method: 'GET',
        url: `/api/workspaces/${harborAndPine.id}/documents?query=${encodeURIComponent(privateTitle)}`,
      })

    expect(bodyAs<Schema<'DocumentPage'>>(await list(people.tom)).items).toHaveLength(1)
    expect(bodyAs<Schema<'DocumentPage'>>(await list(people.marta)).items).toHaveLength(1)
    expect(bodyAs<Schema<'DocumentPage'>>(await list(people.priya)).items).toHaveLength(0)
  })

  it('holds the archived document of each workspace for its owner', async () => {
    const response = await api({
      as: people.lucia,
      method: 'GET',
      url: `/api/workspaces/${almazara.id}/documents?archived=true`,
    })

    expect(bodyAs<Schema<'DocumentPage'>>(response).items.map((document) => document.title)).toEqual([
      'Catálogo de la temporada anterior',
    ])
  })

  it('creates every document with its empty content, its owner and the event of its creation', async () => {
    const documents = await database.db.selectFrom('documents').select('id').execute()
    const withParts = await Promise.all(
      documents.map(async ({ id }) => ({
        states: (
          await database.db.selectFrom('document_states').select('document_id').where('document_id', '=', id).execute()
        ).length,
        owners: (
          await database.db
            .selectFrom('document_access')
            .select('user_id')
            .where('document_id', '=', id)
            .where('role', '=', 'owner')
            .execute()
        ).length,
        created: (
          await database.db
            .selectFrom('activity_events')
            .select('id')
            .where('document_id', '=', id)
            .where('type', '=', 'document.created')
            .execute()
        ).length,
      })),
    )

    expect(withParts).toHaveLength(harborAndPine.documents.length + almazara.documents.length)
    expect(withParts.every((parts) => parts.states === 1 && parts.owners === 1 && parts.created === 1)).toBe(true)
  })
})
