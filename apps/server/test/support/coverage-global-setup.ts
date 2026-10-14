import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestProject } from 'vitest/node'
import { createDatabase } from '../../src/db/database.ts'
import { buildApp } from '../../src/http/app.ts'
import { ContractCoverage } from './contract-coverage.ts'

declare module 'vitest' {
  export interface ProvidedContext {
    contractCoverageDirectory: string
  }
}

/** The operations the server has routes for, read from a real app: a list kept by hand would miss a new route. */
async function implementedOperations(): Promise<ReadonlySet<string>> {
  // Nothing connects: the pool opens its first connection on the first query, and building the app runs none.
  const database = createDatabase('postgres://unused@127.0.0.1:1/unused')
  const app = buildApp({ database })
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
