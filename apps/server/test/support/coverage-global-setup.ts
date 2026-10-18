import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestProject } from 'vitest/node'
import { createDatabase } from '../../src/db/database.ts'
import { buildApp } from '../../src/http/app.ts'
import { createDevIdentity } from '../../src/http/auth/devIdentity.ts'
import { developmentHardening, unlimitedRequests } from './hardening.ts'
import { sessionStackFor } from './auth.ts'
import { noLiveDocuments, silentBroadcaster, silentLiveAccess } from './broadcasters.ts'
import { ContractCoverage } from './contract-coverage.ts'
import { unreachableDatabaseUrl } from './unreachable-database.ts'

declare module 'vitest' {
  export interface ProvidedContext {
    contractCoverageDirectory: string
  }
}

/** The operations the server has routes for, read from a real app: a list kept by hand would miss a new route. */
async function implementedOperations(): Promise<ReadonlySet<string>> {
  // Nothing connects: the pool opens its first connection on the first query, and building the app runs none.
  const database = createDatabase(unreachableDatabaseUrl)
  const { sessions, sessionCookies, devices } = sessionStackFor(database)
  const app = buildApp({
    database,
    hardening: developmentHardening,
    requestLimits: unlimitedRequests,
    authProvider: createDevIdentity(database),
    broadcaster: silentBroadcaster,
    liveAccess: silentLiveAccess,
    liveDocuments: noLiveDocuments,
    sessions,
    sessionCookies,
    devices,
  })
  try {
    await app.ready()
    return new Set(app.implementedOperations)
  } finally {
    await app.close()
    await database.destroy()
  }
}

/**
 * Fails the run when an implemented operation was never exercised. It only judges a complete run: with a file or a test
 * filter, the operations of the files left out would look unexercised.
 */
export default function setup(project: TestProject) {
  const directory = mkdtempSync(join(tmpdir(), 'draftroom-coverage-'))
  project.provide('contractCoverageDirectory', directory)

  return async function teardown(): Promise<void> {
    try {
      const { coverage, testFiles } = ContractCoverage.collect(directory)
      const { testFiles: allFiles } = await project.globTestFiles()
      if (allFiles.every((file) => testFiles.has(file))) {
        coverage.assertCovers(await implementedOperations())
      } else {
        console.warn('Contract coverage was not checked: only some of the integration test files ran.')
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
}
