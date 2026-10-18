import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, type ContractViolation } from '../../src/http/app.ts'
import type { Contract } from '../../src/http/contract.ts'
import { operationRoute } from '../../src/http/operation-route.ts'
import { createContractClient, findOperation, ContractError } from './contract-client.ts'
import { ContractCoverage } from './contract-coverage.ts'
import { createDatabase } from '../../src/db/database.ts'
import type { AuthProvider } from '../../src/http/auth/auth-provider.ts'
import { developmentHardening } from './hardening.ts'
import { sessionStackFor } from './auth.ts'
import { noLiveDocuments, silentBroadcaster, silentLiveAccess } from './broadcasters.ts'
import {
  contractWithSyntheticOperation,
  syntheticOperationId,
  syntheticPath,
  syntheticRoute,
} from './synthetic-contract.ts'
import { unreachableDatabaseUrl } from './unreachable-database.ts'

let contract: Contract
beforeAll(() => {
  contract = contractWithSyntheticOperation()
})

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
})

describe('findOperation', () => {
  const cases: readonly (readonly [string, string, string, string | undefined])[] = [
    ['a path without parameters', 'GET', '/api/health/live', 'getLiveness'],
    ['the method of the request', 'POST', '/api/auth/sign-in', 'signIn'],
    ['a path with a parameter', 'GET', '/api/documents/c4e6a8b0-2d3f-4b5a-9c7e-4a6c8e0b2d44', 'getDocument'],
    ['a query string, which it ignores', 'GET', '/api/workspaces/abc/documents?limit=5', 'listDocuments'],
    ['a literal segment after a parameter', 'GET', '/api/workspaces/abc/pinned', 'listPinnedDocuments'],
    ['a method the path does not have', 'DELETE', '/api/health/live', undefined],
    ['a path that is not in the contract', 'GET', '/api/nothing', undefined],
  ]

  it.each(cases)('finds the operation for %s', (_name, method, url, operationId) => {
    expect(findOperation(contract, method, url)?.id).toBe(operationId)
  })
})

describe('the contract client', () => {
  // These tests are about the client, not about who is calling: everyone is the same person.
  const authProvider: AuthProvider = {
    authenticate: () => Promise.resolve({ status: 'authenticated', principal: { userId: 'someone' } }),
  }
  const unusedDatabase = () => createDatabase(unreachableDatabaseUrl)

  it('returns a response that follows the contract and records the operation as exercised', async () => {
    const coverage = new ContractCoverage()
    const database = unusedDatabase()
    const { sessions, sessionCookies, devices } = sessionStackFor(database)
    app = buildApp({
      database,
      hardening: developmentHardening,
      authProvider,
      sessions,
      sessionCookies,
      devices,
      broadcaster: silentBroadcaster,
      liveAccess: silentLiveAccess,
      liveDocuments: noLiveDocuments,
      contract,
    })
    const client = createContractClient(app, contract, coverage, [])

    const response = await client.request({ method: 'GET', url: '/api/health/live' })

    expect(response).toMatchObject({ operationId: 'getLiveness', statusCode: 200, body: { status: 'ok' } })
    expect(coverage.exercised).toEqual(['getLiveness'])
    await database.destroy()
  })

  it('fails the test when a response does not follow the contract, even from an app with no guard of its own', async () => {
    app = Fastify()
    app.route(operationRoute(contract, 'getLiveness', () => ({ status: 'fine', uptime: 3 })))
    const coverage = new ContractCoverage()
    const client = createContractClient(app, contract, coverage, [])

    await expect(client.request({ method: 'GET', url: '/api/health/live' })).rejects.toThrow(ContractError)
    await expect(client.request({ method: 'GET', url: '/api/health/live' })).rejects.toThrow(/getLiveness answered 200/)
    expect(coverage.exercised).toEqual([])
  })

  it('fails the test when the server replaced a response, whose 500 would pass the contract by itself', async () => {
    const violations: ContractViolation[] = []
    const database = unusedDatabase()
    const { sessions, sessionCookies, devices } = sessionStackFor(database)
    app = buildApp({
      database,
      hardening: developmentHardening,
      authProvider,
      sessions,
      sessionCookies,
      devices,
      broadcaster: silentBroadcaster,
      liveAccess: silentLiveAccess,
      liveDocuments: noLiveDocuments,
      contract,
      onContractViolation: (violation) => violations.push(violation),
    })
    // An operation that exists only in the contract of these tests has no route, so the test brings one that breaks it.
    app.route(syntheticRoute(contract, () => ({ id: 'not-a-uuid' })))
    const client = createContractClient(app, contract, new ContractCoverage(), violations)

    await expect(
      client.request({
        method: 'POST',
        url: syntheticPath,
        payload: { email: 'marta@harborpine.example', password: 'a long enough password' },
      }),
    ).rejects.toThrow(new RegExp(`answered ${syntheticOperationId} against the contract`))
    await database.destroy()
  })

  it('fails the test when it asks for something the contract does not have', async () => {
    app = Fastify()
    const client = createContractClient(app, contract, new ContractCoverage(), [])

    await expect(client.request({ method: 'GET', url: '/api/nothing' })).rejects.toThrow(
      'is not an operation of the contract',
    )
  })
})
