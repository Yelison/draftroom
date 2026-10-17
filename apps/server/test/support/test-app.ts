import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../../src/db/tables.ts'
import { buildApp, type AppDependencies, type ContractViolation } from '../../src/http/app.ts'
import type { AuthProvider } from '../../src/http/auth/auth-provider.ts'
import { createDevIdentity } from '../../src/http/auth/devIdentity.ts'
import { loadContract } from '../../src/http/contract.ts'
import type { DocumentBroadcaster } from '../../src/http/document-broadcaster.ts'
import type { LiveAccess } from '../../src/http/live-access.ts'
import type { LiveDocuments } from '../../src/http/live-documents.ts'
import { sessionStackFor, type SessionStack } from './auth.ts'
import { silentBroadcaster, silentLiveAccess } from './broadcasters.ts'
import { createContractClient } from './contract-client.ts'
import { storedDocuments } from './live-documents.ts'
import { runCoverage } from './run-coverage.ts'

/** Compiled once per test file's worker: it is the slow part of building an app. */
export const contract = loadContract()

export interface TestApp {
  readonly app: FastifyInstance
  readonly request: ReturnType<typeof createContractClient>['request']
}

/** What a test may say about authentication, beyond who the callers are: the sessions, the limits and the passwords. */
export interface TestAuthentication extends Pick<AppDependencies, 'rateLimits' | 'passwords'> {
  /** The stack the app's routes use; the provider is passed apart, because most tests do not sign in. */
  readonly session?: Pick<SessionStack, 'sessions' | 'sessionCookies'>
}

/** The real app on a given database, and a client that holds every response of the test to the contract. */
export function createTestApp(
  database: Kysely<Database>,
  authProvider: AuthProvider = createDevIdentity(database),
  broadcaster: DocumentBroadcaster = silentBroadcaster,
  logger?: AppDependencies['logger'],
  liveAccess: LiveAccess = silentLiveAccess,
  liveDocuments: LiveDocuments = storedDocuments(database),
  { session = sessionStackFor(database), ...authentication }: TestAuthentication = {},
): TestApp {
  const violations: ContractViolation[] = []
  const app = buildApp({
    database,
    authProvider,
    broadcaster,
    liveAccess,
    liveDocuments,
    sessions: session.sessions,
    sessionCookies: session.sessionCookies,
    ...authentication,
    contract,
    ...(logger === undefined ? {} : { logger }),
    onContractViolation: (violation) => violations.push(violation),
  })
  return { app, request: createContractClient(app, contract, runCoverage, violations).request }
}
