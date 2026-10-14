import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../../src/db/tables.ts'
import { buildApp, type ContractViolation } from '../../src/http/app.ts'
import { loadContract } from '../../src/http/contract.ts'
import { createContractClient } from './contract-client.ts'
import { runCoverage } from './run-coverage.ts'

/** Compiled once per test file's worker: it is the slow part of building an app. */
export const contract = loadContract()

export interface TestApp {
  readonly app: FastifyInstance
  readonly request: ReturnType<typeof createContractClient>['request']
}

/** The real app on a given database, and a client that holds every response of the test to the contract. */
export function createTestApp(database: Kysely<Database>): TestApp {
  const violations: ContractViolation[] = []
  const app = buildApp({ database, contract, onContractViolation: (violation) => violations.push(violation) })
  return { app, request: createContractClient(app, contract, runCoverage, violations).request }
}
