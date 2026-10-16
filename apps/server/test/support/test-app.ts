import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../../src/db/tables.ts'
import { buildApp, type AppDependencies, type ContractViolation } from '../../src/http/app.ts'
import type { AuthProvider } from '../../src/http/auth/auth-provider.ts'
import { createDevIdentity } from '../../src/http/auth/devIdentity.ts'
import { loadContract } from '../../src/http/contract.ts'
import type { DocumentBroadcaster } from '../../src/http/document-broadcaster.ts'
import type { LiveAccess } from '../../src/http/live-access.ts'
import { silentBroadcaster, silentLiveAccess } from './broadcasters.ts'
import { createContractClient } from './contract-client.ts'
import { runCoverage } from './run-coverage.ts'

/** Compiled once per test file's worker: it is the slow part of building an app. */
export const contract = loadContract()

export interface TestApp {
  readonly app: FastifyInstance
  readonly request: ReturnType<typeof createContractClient>['request']
}

/** The real app on a given database, and a client that holds every response of the test to the contract. */
export function createTestApp(
  database: Kysely<Database>,
  authProvider: AuthProvider = createDevIdentity(database),
  broadcaster: DocumentBroadcaster = silentBroadcaster,
  logger?: AppDependencies['logger'],
  liveAccess: LiveAccess = silentLiveAccess,
): TestApp {
  const violations: ContractViolation[] = []
  const app = buildApp({
    database,
    authProvider,
    broadcaster,
    liveAccess,
    contract,
    ...(logger === undefined ? {} : { logger }),
    onContractViolation: (violation) => violations.push(violation),
  })
  return { app, request: createContractClient(app, contract, runCoverage, violations).request }
}
