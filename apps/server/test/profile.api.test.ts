import type { Schema } from '@draftroom/contract'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findProfile, updateProfile } from '../src/db/profile.ts'
import type { Database } from '../src/db/tables.ts'
import { apiOf, bodyAs, type Api } from './support/api.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import { createPendingPerson, createPerson, type Person } from './support/world.ts'

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

const update = (as: Person, body: object) => api({ as, method: 'PATCH', url: '/api/me', body })
const me = async (as: Person) => bodyAs<Schema<'Me'>>(await api({ as, method: 'GET', url: '/api/me' }))

describe('the preferences of a new account', () => {
  it('have no language, so the browser decides, and a medium editor text', async () => {
    const person = await createPerson(db, 'Marta Ruiz')

    expect(await me(person)).toEqual({
      id: person.id,
      email: person.email,
      name: 'Marta Ruiz',
      locale: null,
      editorTextSize: 'medium',
    })
  })
})

describe('changing the profile and the preferences', () => {
  it('saves the name, which getMe then serves', async () => {
    const person = await createPerson(db, 'Marta Ruiz')

    const response = await update(person, { name: 'Marta Ruiz Vega' })

    expect(response).toMatchObject({ statusCode: 200, body: { name: 'Marta Ruiz Vega' } })
    expect((await me(person)).name).toBe('Marta Ruiz Vega')
  })

  it('saves the language, which getMe then serves', async () => {
    const person = await createPerson(db, 'Marta Ruiz')

    const response = await update(person, { locale: 'es' })

    expect(response).toMatchObject({ statusCode: 200, body: { locale: 'es' } })
    expect((await me(person)).locale).toBe('es')
  })

  it('saves the size of the editor text, which getMe then serves', async () => {
    const person = await createPerson(db, 'Marta Ruiz')

    const response = await update(person, { editorTextSize: 'large' })

    expect(response).toMatchObject({ statusCode: 200, body: { editorTextSize: 'large' } })
    expect((await me(person)).editorTextSize).toBe('large')
  })

  it('clears the language with null, so the browser decides again', async () => {
    const person = await createPerson(db, 'Marta Ruiz')
    await update(person, { locale: 'es' })

    const response = await update(person, { locale: null })

    expect(response).toMatchObject({ statusCode: 200, body: { locale: null } })
  })

  it('keeps what the request leaves out', async () => {
    const person = await createPerson(db, 'Marta Ruiz')
    await update(person, { locale: 'es', editorTextSize: 'small' })

    await update(person, { name: 'Marta R.' })

    expect(await me(person)).toMatchObject({ name: 'Marta R.', locale: 'es', editorTextSize: 'small' })
  })

  it('does not change the email', async () => {
    const person = await createPerson(db, 'Marta Ruiz')

    await update(person, { name: 'Marta R.' })

    expect((await me(person)).email).toBe(person.email)
  })
})

describe('nobody changes the account of somebody else', () => {
  it('changes the one of the session and leaves the others: the person is never named in the request', async () => {
    const marta = await createPerson(db, 'Marta Ruiz')
    const daniel = await createPerson(db, 'Daniel Okafor')

    await update(daniel, { name: 'Dani', locale: 'es', editorTextSize: 'large' })

    expect(await me(marta)).toMatchObject({ name: 'Marta Ruiz', locale: null, editorTextSize: 'medium' })
  })

  it.each([['id'], ['userId'], ['email']])(
    'refuses a request that names the person by %s, and changes nothing',
    async (field) => {
      const marta = await createPerson(db, 'Marta Ruiz')
      const daniel = await createPerson(db, 'Daniel Okafor')

      const response = await update(daniel, { [field]: marta.id, name: 'Taken over' })

      expect(response.statusCode).toBe(400)
      expect([await me(marta), await me(daniel)]).toMatchObject([{ name: 'Marta Ruiz' }, { name: 'Daniel Okafor' }])
    },
  )

  it('writes nothing for a member who has not signed up, and finds no account to answer with', async () => {
    const pending = await createPendingPerson(db)

    const answer = await updateProfile(db, pending.id, { editorTextSize: 'large' })

    expect(answer).toBeUndefined()
    expect(await findProfile(db, pending.id)).toMatchObject({ editorTextSize: 'medium' })
  })
})

describe('a request that is not valid', () => {
  it.each([
    ['an empty request', {}],
    ['an empty name', { name: '' }],
    ['no name at all', { name: null }],
    ['a language that is not offered', { locale: 'fr' }],
    ['a text size that is not offered', { editorTextSize: 'huge' }],
    ['a field nobody knows', { theme: 'dark' }],
  ])('is refused with 400, and changes nothing: %s', async (_name, body) => {
    const person = await createPerson(db, 'Marta Ruiz')

    const response = await update(person, body)

    expect(response).toMatchObject({ statusCode: 400, body: { code: 'validation-failed' } })
    expect(await me(person)).toMatchObject({ name: 'Marta Ruiz', locale: null, editorTextSize: 'medium' })
  })

  it('names the field of a name that is empty', async () => {
    const person = await createPerson(db, 'Marta Ruiz')

    const response = await update(person, { name: '' })

    expect(response.body).toMatchObject({ errors: [{ pointer: '/name', code: 'too-short' }] })
  })
})

describe('the length of the name, counted in code points', () => {
  const emoji = '🙂'

  it('takes 80 emoji, which are 160 units of UTF-16 and 80 characters for the database', async () => {
    const person = await createPerson(db, 'Marta Ruiz')

    const response = await update(person, { name: emoji.repeat(80) })

    expect(response).toMatchObject({ statusCode: 200, body: { name: emoji.repeat(80) } })
  })

  it('refuses 81 emoji with 413, and keeps the name', async () => {
    const person = await createPerson(db, 'Marta Ruiz')

    const response = await update(person, { name: emoji.repeat(81) })

    expect(response).toMatchObject({ statusCode: 413, body: { errors: [{ pointer: '/name', code: 'too-long' }] } })
    expect((await me(person)).name).toBe('Marta Ruiz')
  })
})
