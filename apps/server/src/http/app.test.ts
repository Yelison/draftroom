import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { unreachableDatabaseUrl } from '../../test/support/unreachable-database.ts'
import { createDatabase } from '../db/database.ts'
import type { Database } from '../db/tables.ts'
import { buildApp, type ContractViolation } from './app.ts'
import type { AuthProvider } from './auth/auth-provider.ts'
import { loadContract, type Contract } from './contract.ts'
import { operationRoute } from './operation-route.ts'

// The application without a database behind it: what the server does before any handler runs, and when a handler
// goes wrong. Checks that need a real PostgreSQL are in test/.

const workspaceId = '0b1f6d54-3c1a-4f55-9a43-6a7d2f5e8c01'
const problemType = 'application/problem+json'

const threadId = 'c4e6a8b0-2d3f-4b5a-9c7e-4a6c8e0b2d44'
const marta = { id: '5b8f7a3e-2d4c-4e1b-8a6f-1c9d3e7b0a11', name: 'Marta Ruiz' }

const comment = {
  id: 'd5f7b9c1-3e4a-4c6b-8d0f-5b7d9f1c3e55',
  threadId,
  author: marta,
  body: 'Yes, it runs on the 4th.',
  createdAt: '2026-10-13T14:00:00Z',
  updatedAt: '2026-10-13T14:00:00Z',
}

// The operations below are the ones nobody has a route for yet: the app is tested with the handlers of the test, not
// with the real ones, and a route cannot be declared twice. The tests of the real routes are in test/.
const membersUrl = `/api/workspaces/${workspaceId}/members`

/** Everyone is Marta, and the provider records what it was asked: the app's checks, not an identity, are under test. */
const signedInAsMarta: AuthProvider = {
  authenticate: () => Promise.resolve({ status: 'authenticated', principal: { userId: marta.id } }),
}

let contract: Contract
beforeAll(() => {
  contract = loadContract()
})

let database: Kysely<Database> | undefined
let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
  await database?.destroy()
})

function appWithoutDatabase(
  violations: ContractViolation[] = [],
  authProvider: AuthProvider = signedInAsMarta,
): FastifyInstance {
  database = createDatabase(unreachableDatabaseUrl)
  app = buildApp({
    database,
    authProvider,
    contract,
    onContractViolation: (violation) => violations.push(violation),
  })
  return app
}

describe('liveness and readiness', () => {
  it('answers live without touching the database, so an outage does not look like a dead process', async () => {
    const response = await appWithoutDatabase().inject('/api/health/live')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('answers ready with 503 and the contract problem when the database cannot be reached', async () => {
    const response = await appWithoutDatabase().inject('/api/health/ready')

    expect(response.statusCode).toBe(503)
    expect(response.headers['content-type']).toContain(problemType)
    expect(response.json()).toEqual({
      type: '/problems/unavailable',
      title: 'The server is not ready.',
      status: 503,
      code: 'unavailable',
    })
  })
})

// The operations this server answers: a route added or dropped by accident changes this list, and with it this test.
const implementedOperations = [
  'getLiveness',
  'getReadiness',
  'getMe',
  'listWorkspaces',
  'getWorkspace',
  'listFolders',
  'createFolder',
  'updateFolder',
  'deleteFolder',
  'listDocuments',
  'createDocument',
  'getDocument',
  'updateDocument',
  'archiveDocument',
  'restoreDocument',
  'deleteDocument',
  'pinDocument',
  'unpinDocument',
  'listPinnedDocuments',
  'listSharedDocuments',
]

describe('the routes of the app', () => {
  it('are the operations of the contract that have a handler, read from the routes themselves', async () => {
    const application = appWithoutDatabase()
    await application.ready()

    expect([...application.implementedOperations].sort()).toEqual([...implementedOperations].sort())
  })

  it('do not answer HEAD, which the contract does not have', async () => {
    const response = await appWithoutDatabase().inject({ method: 'HEAD', url: '/api/health/live' })

    expect(response.statusCode).toBe(404)
  })

  it('refuse a query the operation does not declare with the validation-failed problem', async () => {
    const response = await appWithoutDatabase().inject('/api/health/live?probe=1')

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      code: 'validation-failed',
      errors: [{ pointer: '/query/probe', code: 'unknown-field' }],
    })
  })

  it('answer a URL that cannot be decoded with the validation-failed problem', async () => {
    const response = await appWithoutDatabase().inject('/api/documents/%E0%A4%A')

    expect(response.statusCode).toBe(400)
    expect(response.headers['content-type']).toContain(problemType)
    expect(response.json()).toEqual({
      type: '/problems/validation-failed',
      title: 'The request is not valid.',
      status: 400,
      code: 'validation-failed',
      errors: [{ pointer: '/', code: 'invalid-format' }],
    })
  })

  it('answer a path that is not in the contract with the not-found problem', async () => {
    const response = await appWithoutDatabase().inject('/api/nothing-here')

    expect(response.statusCode).toBe(404)
    expect(response.headers['content-type']).toContain(problemType)
    expect(response.json()).toMatchObject({ status: 404, code: 'not-found' })
  })
})

describe('a request that breaks the contract', () => {
  function withReply(): FastifyInstance {
    const application = appWithoutDatabase()
    application.route(operationRoute(contract, 'replyToThread', (_request, reply) => reply.code(201).send(comment)))
    return application
  }
  const create = (application: FastifyInstance, payload: unknown) =>
    application.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/replies`,
      payload: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
    })

  it('gets the validation-failed problem of the contract, with the field and its code', async () => {
    const response = await create(withReply(), { body: '' })

    expect(response.statusCode).toBe(400)
    expect(response.headers['content-type']).toContain(problemType)
    expect(response.json()).toEqual({
      type: '/problems/validation-failed',
      title: 'The request is not valid.',
      status: 400,
      code: 'validation-failed',
      errors: [{ pointer: '/body', code: 'too-short' }],
    })
  })

  it('gets too-large for a text over its limit', async () => {
    const response = await create(withReply(), { body: 'a'.repeat(5001) })

    expect(response.statusCode).toBe(413)
    expect(response.json()).toMatchObject({ code: 'too-large', errors: [{ pointer: '/body', code: 'too-long' }] })
  })

  it('reaches the handler once it follows the contract', async () => {
    const response = await create(withReply(), { body: 'Yes, it runs on the 4th.' })

    expect(response.statusCode).toBe(201)
  })

  it('is refused for a path parameter that is not an id', async () => {
    const response = await withReply().inject({
      method: 'POST',
      url: '/api/threads/nope/replies',
      payload: { body: 'a' },
    })

    expect(response.json()).toMatchObject({
      code: 'validation-failed',
      errors: [{ pointer: '/path/threadId', code: 'invalid-format' }],
    })
  })

  it('is refused when the JSON cannot be read', async () => {
    const response = await withReply().inject({
      method: 'POST',
      url: `/api/threads/${threadId}/replies`,
      payload: '{"body":',
      headers: { 'content-type': 'application/json' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      code: 'validation-failed',
      errors: [{ pointer: '/', code: 'invalid-format' }],
    })
  })

  it('is refused when it is not JSON at all, because the contract has no 415', async () => {
    const response = await withReply().inject({
      method: 'POST',
      url: `/api/threads/${threadId}/replies`,
      payload: 'body=a',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'validation-failed' })
  })

  it('is refused with too-large, and no field, when the body is bigger than the server reads', async () => {
    const response = await create(withReply(), { body: 'a', padding: 'x'.repeat(1_100_000) })

    expect(response.statusCode).toBe(413)
    expect(response.json()).toEqual({
      type: '/problems/too-large',
      title: 'A value exceeds its limit.',
      status: 413,
      code: 'too-large',
    })
  })
})

describe('a handler that fails', () => {
  const failWith = (error: Error) => {
    const application = appWithoutDatabase()
    application.route(
      operationRoute(contract, 'listMembers', () => {
        throw error
      }),
    )
    return application.inject(membersUrl)
  }

  it('answers the internal-error problem and keeps the cause to itself', async () => {
    const response = await failWith(new Error('the connection string is postgres://secret'))

    expect(response.statusCode).toBe(500)
    expect(response.body).not.toContain('secret')
    expect(response.json()).toMatchObject({ status: 500, code: 'internal-error' })
  })

  // A handler may throw an HTTP error for these four; each keeps the code the contract gives it, so the 404 that hides
  // a resource from someone who cannot read it is never turned into a 400.
  const httpErrors: readonly (readonly [number, string])[] = [
    [401, 'unauthenticated'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [409, 'conflict'],
  ]

  it.each(httpErrors)('keeps a thrown %i as the %s of the contract', async (statusCode, code) => {
    const response = await failWith(Object.assign(new Error('refused'), { statusCode }))

    expect(response.statusCode).toBe(statusCode)
    expect(response.json()).toMatchObject({ status: statusCode, code })
  })

  it("does not carry the handler's headers into the 500, a session cookie included", async () => {
    const application = appWithoutDatabase()
    application.route(
      operationRoute(contract, 'listMembers', (_request, reply) => {
        reply.header('set-cookie', 'dr_session=abc; HttpOnly').header('etag', '"v1"')
        throw new Error('failed after the session was started')
      }),
    )

    const response = await application.inject(membersUrl)

    expect(response.statusCode).toBe(500)
    expect(response.headers).not.toHaveProperty('set-cookie')
    expect(response.headers).not.toHaveProperty('etag')
    expect(response.headers['content-type']).toContain(problemType)
  })

  // The contract does not define these as answers of a handler, so they are bugs of the server: a 500, not a 400 that
  // would blame the request.
  it.each([400, 413, 422, 429])('answers a thrown %i with the internal-error problem', async (statusCode) => {
    const response = await failWith(Object.assign(new Error('refused'), { statusCode }))

    expect(response.statusCode).toBe(500)
    expect(response.json()).toMatchObject({ code: 'internal-error' })
  })
})

describe('a response that breaks the contract', () => {
  it('never leaves the server: it becomes a 500, and the violation is reported with its reason', async () => {
    const violations: ContractViolation[] = []
    const application = appWithoutDatabase(violations)
    application.route(
      operationRoute(contract, 'listMembers', () => ({
        items: [{ userId: marta.id, email: 'marta@harborpine.example' }],
      })),
    )

    const response = await application.inject(membersUrl)

    expect(response.statusCode).toBe(500)
    expect(response.json()).toMatchObject({ code: 'internal-error' })
    expect(response.body).not.toContain('marta@harborpine.example')
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ operationId: 'listMembers', status: 200 })
    expect(violations[0]?.reason).toContain('name')
  })

  it("does not carry the handler's headers, a session cookie included", async () => {
    const application = appWithoutDatabase()
    application.route(
      operationRoute(contract, 'listMembers', (_request, reply) =>
        reply
          .header('set-cookie', 'dr_session=abc; HttpOnly')
          .header('etag', '"v1"')
          .header('location', '/api/me')
          .header('retry-after', '3')
          .header('cache-control', 'max-age=60')
          .send({ items: [{ userId: 'not-a-uuid' }] }),
      ),
    )

    const response = await application.inject(membersUrl)

    expect(response.statusCode).toBe(500)
    expect(response.headers).not.toHaveProperty('set-cookie')
    expect(response.headers).not.toHaveProperty('etag')
    expect(response.headers).not.toHaveProperty('location')
    expect(response.headers).not.toHaveProperty('retry-after')
    expect(response.headers).not.toHaveProperty('cache-control')
    expect(response.headers['content-type']).toContain(problemType)
  })

  it('is let through when the contract accepts it', async () => {
    const violations: ContractViolation[] = []
    const application = appWithoutDatabase(violations)
    application.route(
      operationRoute(contract, 'listMembers', () => ({
        items: [
          {
            userId: marta.id,
            email: 'marta@harborpine.example',
            name: marta.name,
            role: 'owner',
            status: 'active',
            createdAt: '2026-10-13T14:00:00Z',
          },
        ],
      })),
    )

    expect((await application.inject(membersUrl)).statusCode).toBe(200)
    expect(violations).toEqual([])
  })
})

describe('the session check', () => {
  const requests: string[] = []
  const recording = (answer: Awaited<ReturnType<AuthProvider['authenticate']>>): AuthProvider => ({
    authenticate: (_request, requirement) => {
      requests.push(requirement.csrf ? 'with csrf' : 'without csrf')
      return Promise.resolve(answer)
    },
  })
  const nobody = recording({ status: 'unauthenticated' })
  afterEach(() => {
    requests.length = 0
  })

  function withReply(provider: AuthProvider): FastifyInstance {
    const application = appWithoutDatabase([], provider)
    application.route(operationRoute(contract, 'replyToThread', (_request, reply) => reply.code(201).send(comment)))
    application.route(operationRoute(contract, 'listMembers', () => ({ items: [] })))
    return application
  }
  const reply = (application: FastifyInstance, payload: string) =>
    application.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/replies`,
      payload,
      headers: { 'content-type': 'application/json' },
    })

  it('answers 401 to a request without a session before it reads the body, so a broken body tells nothing', async () => {
    const response = await reply(withReply(nobody), '{"body":')

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ status: 401, code: 'unauthenticated' })
  })

  it('answers 401 before it checks the shape of the request', async () => {
    const response = await reply(withReply(nobody), JSON.stringify({ body: '' }))

    expect(response.statusCode).toBe(401)
  })

  it('answers 403 csrf when the provider rejects the token, also before the body is read', async () => {
    const response = await reply(withReply(recording({ status: 'csrf-rejected' })), '{"body":')

    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ status: 403, code: 'csrf' })
  })

  it('asks for the CSRF token on a method that changes state, and only there', async () => {
    const application = withReply(recording({ status: 'authenticated', principal: { userId: marta.id } }))

    await reply(application, JSON.stringify({ body: 'Yes' }))
    await application.inject(membersUrl)

    expect(requests).toEqual(['with csrf', 'without csrf'])
  })

  it('does not ask the provider about the health probes, which need no session', async () => {
    const application = appWithoutDatabase([], nobody)

    expect((await application.inject('/api/health/live')).statusCode).toBe(200)
    expect(requests).toEqual([])
  })

  it('answers a path the contract does not have with 404, whoever asks', async () => {
    const response = await appWithoutDatabase([], nobody).inject('/api/nothing-here')

    expect(response.statusCode).toBe(404)
  })
})
