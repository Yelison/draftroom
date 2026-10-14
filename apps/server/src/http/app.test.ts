import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { unreachableDatabaseUrl } from '../../test/support/unreachable-database.ts'
import { createDatabase } from '../db/database.ts'
import type { Database } from '../db/tables.ts'
import { buildApp, type ContractViolation } from './app.ts'
import { loadContract, type Contract } from './contract.ts'
import { operationRoute } from './operation-route.ts'

// The application without a database behind it: what the server does before any handler runs, and when a handler
// goes wrong. Checks that need a real PostgreSQL are in test/.

const workspaceId = '0b1f6d54-3c1a-4f55-9a43-6a7d2f5e8c01'
const problemType = 'application/problem+json'

const document = {
  id: 'c4e6a8b0-2d3f-4b5a-9c7e-4a6c8e0b2d44',
  workspaceId,
  folderId: null,
  title: 'Autumn launch plan',
  excerpt: null,
  revision: 1,
  role: 'owner',
  generalAccess: 'none',
  pinned: false,
  createdBy: { id: '5b8f7a3e-2d4c-4e1b-8a6f-1c9d3e7b0a11', name: 'Marta Ruiz' },
  createdAt: '2026-10-13T14:00:00Z',
  updatedAt: '2026-10-13T14:00:00Z',
  archivedAt: null,
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

function appWithoutDatabase(violations: ContractViolation[] = []): FastifyInstance {
  database = createDatabase(unreachableDatabaseUrl)
  app = buildApp({ database, contract, onContractViolation: (violation) => violations.push(violation) })
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

describe('the routes of the app', () => {
  it('are the operations of the contract that have a handler, read from the routes themselves', async () => {
    const application = appWithoutDatabase()
    await application.ready()

    expect([...application.implementedOperations].sort()).toEqual(['getLiveness', 'getReadiness'])
  })

  it('do not answer HEAD, which the contract does not have', async () => {
    const response = await appWithoutDatabase().inject({ method: 'HEAD', url: '/api/health/live' })

    expect(response.statusCode).toBe(404)
  })

  it('answer a path that is not in the contract with the not-found problem', async () => {
    const response = await appWithoutDatabase().inject('/api/nothing-here')

    expect(response.statusCode).toBe(404)
    expect(response.headers['content-type']).toContain(problemType)
    expect(response.json()).toMatchObject({ status: 404, code: 'not-found' })
  })
})

describe('a request that breaks the contract', () => {
  function withCreateDocument(): FastifyInstance {
    const application = appWithoutDatabase()
    application.route(operationRoute(contract, 'createDocument', (_request, reply) => reply.code(201).send(document)))
    return application
  }
  const create = (application: FastifyInstance, payload: unknown) =>
    application.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      payload: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
    })

  it('gets the validation-failed problem of the contract, with the field and its code', async () => {
    const response = await create(withCreateDocument(), { title: '' })

    expect(response.statusCode).toBe(400)
    expect(response.headers['content-type']).toContain(problemType)
    expect(response.json()).toEqual({
      type: '/problems/validation-failed',
      title: 'The request is not valid.',
      status: 400,
      code: 'validation-failed',
      errors: [{ pointer: '/title', code: 'too-short' }],
    })
  })

  it('gets too-large for a text over its limit', async () => {
    const response = await create(withCreateDocument(), { title: 'a'.repeat(201) })

    expect(response.statusCode).toBe(413)
    expect(response.json()).toMatchObject({ code: 'too-large', errors: [{ pointer: '/title', code: 'too-long' }] })
  })

  it('reaches the handler once it follows the contract', async () => {
    const response = await create(withCreateDocument(), { title: 'Autumn launch plan' })

    expect(response.statusCode).toBe(201)
  })

  it('is refused for a path parameter that is not an id', async () => {
    const response = await withCreateDocument().inject({
      method: 'POST',
      url: '/api/workspaces/nope/documents',
      payload: { title: 'a' },
    })

    expect(response.json()).toMatchObject({
      code: 'validation-failed',
      errors: [{ pointer: '/path/workspaceId', code: 'invalid-format' }],
    })
  })

  it('is refused when the JSON cannot be read', async () => {
    const response = await withCreateDocument().inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      payload: '{"title":',
      headers: { 'content-type': 'application/json' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      code: 'validation-failed',
      errors: [{ pointer: '/', code: 'invalid-format' }],
    })
  })

  it('is refused when it is not JSON at all, because the contract has no 415', async () => {
    const response = await withCreateDocument().inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      payload: 'title=a',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'validation-failed' })
  })

  it('is refused with too-large, and no field, when the body is bigger than the server reads', async () => {
    const response = await create(withCreateDocument(), { title: 'a', padding: 'x'.repeat(1_100_000) })

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
      operationRoute(contract, 'getMe', () => {
        throw error
      }),
    )
    return application.inject('/api/me')
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

  // The contract does not define these as answers of a handler, so they are bugs of the server: a 500, not a 400 that
  // would blame the request.
  it.each([400, 422, 429])('answers a thrown %i with the internal-error problem', async (statusCode) => {
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
      operationRoute(contract, 'getMe', () => ({ id: 'not-a-uuid', email: 'marta@harborpine.example' })),
    )

    const response = await application.inject('/api/me')

    expect(response.statusCode).toBe(500)
    expect(response.json()).toMatchObject({ code: 'internal-error' })
    expect(response.body).not.toContain('marta@harborpine.example')
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ operationId: 'getMe', status: 200 })
    expect(violations[0]?.reason).toContain('name')
  })

  it("does not carry the handler's headers, a session cookie included", async () => {
    const application = appWithoutDatabase()
    application.route(
      operationRoute(contract, 'getMe', (_request, reply) =>
        reply
          .header('set-cookie', 'dr_session=abc; HttpOnly')
          .header('etag', '"v1"')
          .header('location', '/api/me')
          .header('retry-after', '3')
          .header('cache-control', 'max-age=60')
          .send({ id: 'not-a-uuid' }),
      ),
    )

    const response = await application.inject('/api/me')

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
      operationRoute(contract, 'getMe', () => ({
        id: workspaceId,
        email: 'marta@harborpine.example',
        name: 'Marta Ruiz',
      })),
    )

    expect((await application.inject('/api/me')).statusCode).toBe(200)
    expect(violations).toEqual([])
  })
})
