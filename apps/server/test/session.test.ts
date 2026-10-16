import { randomUUID } from 'node:crypto'
import type { Schema } from '@draftroom/contract'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/db/tables.ts'
import { devUserHeader } from '../src/http/auth/devIdentity.ts'
import { loadConfig } from '../src/config.ts'
import { authProviderFor } from '../src/http/auth/select.ts'
import { apiOf, bodyAs, type Api, type Call } from './support/api.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import {
  createDocument,
  createFolder,
  createPendingPerson,
  createPerson,
  createStudio,
  createWorkspace,
  grant,
  join,
  type Person,
  type Studio,
} from './support/world.ts'

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
let api: Api
let studio: Studio
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  server = createTestApp(db)
  api = apiOf(server)
  studio = await createStudio(db)
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

describe('who is calling', () => {
  it('is the person the development header names, whatever the case of their email', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/api/me',
      headers: { [devUserHeader]: studio.owner.email.toUpperCase() },
    })

    expect(response).toMatchObject({
      statusCode: 200,
      body: { id: studio.owner.id, email: studio.owner.email, name: 'Marta Ruiz' },
    })
  })

  it('lists the workspaces of that person, with their role in each', async () => {
    const other = await createWorkspace(db, 'Almazara')
    await join(db, other, studio.owner, 'member')

    const response = await api({ as: studio.owner, method: 'GET', url: '/api/workspaces' })

    expect(bodyAs<Schema<'WorkspaceList'>>(response).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: studio.workspaceId, role: 'owner' }),
        expect.objectContaining({ id: other, name: 'Almazara', role: 'member' }),
      ]),
    )
  })

  const sessionRoutes: readonly (readonly [string, Call])[] = [
    ['getMe', { method: 'GET', url: '/api/me' }],
    ['listWorkspaces', { method: 'GET', url: '/api/workspaces' }],
    ['getDocument', { method: 'GET', url: `/api/documents/${randomUUID()}` }],
    [
      'createDocument, with a body that is wrong',
      { method: 'POST', url: `/api/workspaces/${randomUUID()}/documents`, body: { title: '' } },
    ],
    [
      'updateDocument, with a body that is too large',
      { method: 'PATCH', url: `/api/documents/${randomUUID()}`, body: { title: 'x'.repeat(201), revision: 1 } },
    ],
    ['deleteFolder', { method: 'DELETE', url: `/api/folders/${randomUUID()}` }],
  ]

  describe.each([
    ['no header', undefined],
    ['an email nobody has', 'nobody@harborpine.example'],
    ['an empty header', ''],
  ])('with %s', (_name, header) => {
    it.each(sessionRoutes)('%s answers 401, before anything is said about the request', async (_operation, call) => {
      const response = await server.request({
        method: call.method,
        url: call.url,
        ...(header === undefined ? {} : { headers: { [devUserHeader]: header } }),
        ...(call.body === undefined ? {} : { payload: call.body }),
      })

      expect(response).toMatchObject({ statusCode: 401, body: { code: 'unauthenticated' } })
    })
  })

  it('does not take a member who has not signed up for a person: they have no name and nobody is them', async () => {
    const pending = await createPendingPerson(db)
    await join(db, studio.workspaceId, pending)

    // A route that does not need the person's name, so only the identity check can refuse it.
    const response = await api({ as: pending, method: 'GET', url: '/api/workspaces' })

    expect(response.statusCode).toBe(401)
  })
})

describe('the development identity outside development', () => {
  const environments = {
    development: { NODE_ENV: 'development' },
    test: { NODE_ENV: 'test' },
    production: {
      NODE_ENV: 'production',
      SESSION_SECRET: 'a-secret-of-at-least-thirty-two-characters',
      ALLOWED_ORIGINS: 'https://draftroom.example',
    },
    'a missing NODE_ENV': {},
    'an empty NODE_ENV': { NODE_ENV: '' },
  }
  // The same request with the same real person, once where the header is accepted and once where it must not be: the
  // first answer is what makes the others mean something. The provider is chosen the way the entry point chooses it,
  // from a configuration read from the environment.
  const request = (environment: keyof typeof environments) =>
    createTestApp(
      db,
      authProviderFor(loadConfig({ DATABASE_URL: database.url, ...environments[environment] }), db),
    ).request({
      method: 'GET',
      url: `/api/documents/${studio.documentId}`,
      headers: { [devUserHeader]: studio.owner.email },
    })

  it.each(['development', 'test'] as const)('is accepted in %s', async (environment) => {
    expect((await request(environment)).statusCode).toBe(200)
  })

  it.each(['production', 'a missing NODE_ENV', 'an empty NODE_ENV'] as const)(
    'is refused with %s, for a person who is real and owns the document',
    async (environment) => {
      const response = await request(environment)

      expect(response).toMatchObject({ statusCode: 401, body: { code: 'unauthenticated' } })
    },
  )

  it('leaves the health probes open in production, which need no one', async () => {
    const production = createTestApp(
      db,
      authProviderFor(loadConfig({ DATABASE_URL: database.url, ...environments.production }), db),
    )

    const live = await production.request({ method: 'GET', url: '/api/health/live' })

    expect(live.statusCode).toBe(200)
  })
})

describe('the order of the checks', () => {
  let viewer: Person
  let editor: Person
  let outsider: Person
  let documentId: string
  let foreignFolderId: string
  beforeAll(async () => {
    viewer = await createPerson(db, 'Tom Weller')
    editor = await createPerson(db, 'Priya Raman')
    outsider = await createPerson(db, 'Camila Ortega')
    await join(db, studio.workspaceId, viewer)
    await join(db, studio.workspaceId, editor)
    documentId = await createDocument(db, { workspaceId: studio.workspaceId, creator: studio.owner })
    await grant(db, { workspaceId: studio.workspaceId, documentId, person: viewer, role: 'viewer' })
    await grant(db, { workspaceId: studio.workspaceId, documentId, person: editor, role: 'editor' })
    foreignFolderId = await createFolder(db, await createWorkspace(db, 'Almazara'))
  })
  const patch = (as: Person | undefined, id: string, body: object) =>
    api({ ...(as === undefined ? {} : { as }), method: 'PATCH', url: `/api/documents/${id}`, body })

  it('refuses the shape of a request before it looks for the resource: 400 for a document that is not there', async () => {
    const response = await patch(studio.owner, randomUUID(), { title: '', revision: 1 })

    expect(response.statusCode).toBe(400)
  })

  it('looks for the resource before the role: a person outside the workspace gets 404, not 403', async () => {
    expect((await patch(outsider, documentId, { title: 'Budget', revision: 1 })).statusCode).toBe(404)
  })

  it('checks the role before the references: a viewer who names a folder that is not there gets 403, not 400', async () => {
    const response = await patch(viewer, documentId, { folderId: foreignFolderId, revision: 1 })

    expect(response.statusCode).toBe(403)
  })

  it('checks the role before the state: a viewer with a stale revision gets 403, not the 409 that would show the document', async () => {
    const response = await patch(viewer, documentId, { title: 'Budget', revision: 99 })

    expect(response).toMatchObject({ statusCode: 403, body: { code: 'forbidden' } })
    expect(response.body).not.toHaveProperty('current')
  })

  it('checks the references before the state: an editor who names a folder that is not there and a stale revision gets 400', async () => {
    const response = await patch(editor, documentId, { folderId: foreignFolderId, revision: 99 })

    expect(response).toMatchObject({
      statusCode: 400,
      body: { errors: [{ pointer: '/folderId', code: 'invalid-value' }] },
    })
  })

  describe('does not tell a person outside the workspace which folders it has', () => {
    let folderId: string
    beforeAll(async () => {
      folderId = await createFolder(db, studio.workspaceId)
    })

    it('when listing: a folder of the workspace and one that does not exist both answer 404', async () => {
      const list = (id: string) =>
        api({ as: outsider, method: 'GET', url: `/api/workspaces/${studio.workspaceId}/documents?folderId=${id}` })

      const real = await list(folderId)

      expect(real.statusCode).toBe(404)
      expect(real.body).toEqual((await list(randomUUID())).body)
    })

    it('when creating a document: a folder of the workspace and one that does not exist both answer 404', async () => {
      const create = (id: string) =>
        api({
          as: outsider,
          method: 'POST',
          url: `/api/workspaces/${studio.workspaceId}/documents`,
          body: { title: 'Budget', folderId: id },
        })

      const real = await create(folderId)

      expect(real.statusCode).toBe(404)
      expect(real.body).toEqual((await create(randomUUID())).body)
    })
  })

  it('tells a template that is not known only to someone allowed to create documents: 404 outside the workspace, 400 inside', async () => {
    const create = (as: Person) =>
      api({
        as,
        method: 'POST',
        url: `/api/workspaces/${studio.workspaceId}/documents`,
        body: { title: 'Budget', templateId: 'meeting-notes' },
      })

    expect((await create(outsider)).statusCode).toBe(404)
    expect((await create(viewer)).statusCode).toBe(400)
  })
})
