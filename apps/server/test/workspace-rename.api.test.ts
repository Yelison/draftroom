import type { Schema } from '@draftroom/contract'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/db/tables.ts'
import { apiOf, bodyAs, type Api } from './support/api.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import { createPerson, createWorkspace, join, type Person } from './support/world.ts'

// Who may rename comes from the matrix (`access-matrix.test.ts`); this is what renaming does, and what it must not touch.

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

const rename = (as: Person, workspaceId: string, body: object) =>
  api({ as, method: 'PATCH', url: `/api/workspaces/${workspaceId}`, body })
const nameOf = async (as: Person, workspaceId: string) =>
  bodyAs<Schema<'Workspace'>>(await api({ as, method: 'GET', url: `/api/workspaces/${workspaceId}` })).name

async function workspaceWith(role: 'owner' | 'member') {
  const workspaceId = await createWorkspace(db, 'Harbor & Pine')
  const person = await createPerson(db, 'Marta Ruiz')
  await join(db, workspaceId, person, role)
  return { workspaceId, person }
}

describe('renaming a workspace', () => {
  it('gives it the new name, with the role of the owner who asked and the date it was created', async () => {
    const { workspaceId, person } = await workspaceWith('owner')

    const response = await rename(person, workspaceId, { name: 'Almazara' })

    expect(response).toMatchObject({
      statusCode: 200,
      body: { id: workspaceId, name: 'Almazara', role: 'owner', createdAt: expect.any(String) },
    })
    expect(await nameOf(person, workspaceId)).toBe('Almazara')
  })

  it('is seen by the other members, who read the same workspace', async () => {
    const { workspaceId, person } = await workspaceWith('owner')
    const colleague = await createPerson(db, 'Daniel Okafor')
    await join(db, workspaceId, colleague)

    await rename(person, workspaceId, { name: 'Almazara' })

    expect(await nameOf(colleague, workspaceId)).toBe('Almazara')
  })

  it('leaves a member who is not an owner out: 403, and the name stays', async () => {
    const { workspaceId, person } = await workspaceWith('member')

    const response = await rename(person, workspaceId, { name: 'Almazara' })

    expect(response).toMatchObject({ statusCode: 403, body: { code: 'forbidden' } })
    expect(await nameOf(person, workspaceId)).toBe('Harbor & Pine')
  })

  it('does not reach the workspace of somebody else: an owner elsewhere gets 404, and the name stays', async () => {
    const mine = await workspaceWith('owner')
    const theirs = await workspaceWith('owner')

    const response = await rename(mine.person, theirs.workspaceId, { name: 'Taken over' })

    expect(response).toMatchObject({ statusCode: 404, body: { code: 'not-found' } })
    expect(await nameOf(theirs.person, theirs.workspaceId)).toBe('Harbor & Pine')
  })

  it('renames only the workspace the request names', async () => {
    const first = await workspaceWith('owner')
    const second = await createWorkspace(db, 'Almazara')
    await join(db, second, first.person, 'owner')

    await rename(first.person, first.workspaceId, { name: 'Renamed' })

    expect(await nameOf(first.person, second)).toBe('Almazara')
  })
})

describe('a name that is not valid', () => {
  it.each([
    ['no name', {}],
    ['an empty name', { name: '' }],
    ['a field nobody knows', { name: 'Almazara', colour: 'blue' }],
  ])('is refused with 400: %s', async (_label, body) => {
    const { workspaceId, person } = await workspaceWith('owner')

    expect((await rename(person, workspaceId, body)).statusCode).toBe(400)
    expect(await nameOf(person, workspaceId)).toBe('Harbor & Pine')
  })

  it('is refused before anyone learns whether the workspace exists: 400 for an outsider too', async () => {
    const { workspaceId } = await workspaceWith('owner')
    const outsider = await createPerson(db, 'Camila Ortega')

    expect((await rename(outsider, workspaceId, { name: '' })).statusCode).toBe(400)
  })

  const emoji = '🙂'

  it('takes 80 emoji, which are 160 units of UTF-16 and 80 characters for the database', async () => {
    const { workspaceId, person } = await workspaceWith('owner')

    expect((await rename(person, workspaceId, { name: emoji.repeat(80) })).statusCode).toBe(200)
  })

  it('refuses 81 emoji with 413, and keeps the name', async () => {
    const { workspaceId, person } = await workspaceWith('owner')

    const response = await rename(person, workspaceId, { name: emoji.repeat(81) })

    expect(response).toMatchObject({ statusCode: 413, body: { errors: [{ pointer: '/name', code: 'too-long' }] } })
    expect(await nameOf(person, workspaceId)).toBe('Harbor & Pine')
  })
})
