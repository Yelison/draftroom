import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

// Every operation the server implements must be exercised by at least one integration test. Test files run in separate
// workers, so each one writes what it exercised to a shared folder, and the run adds them up when it ends.

const record = z.object({ testFile: z.string(), operations: z.array(z.string()) })

export class ContractCoverage {
  readonly #exercised = new Set<string>()

  record(operationId: string): void {
    this.#exercised.add(operationId)
  }

  get exercised(): readonly string[] {
    return [...this.#exercised].sort()
  }

  /** Writes what the test file exercised, for the run to collect. Every file saves one, even if it exercised nothing. */
  save(directory: string, testFile: string): void {
    const name = createHash('sha256').update(testFile).digest('hex').slice(0, 16)
    writeFileSync(join(directory, `${name}.json`), JSON.stringify({ testFile, operations: this.exercised }))
  }

  /** What every test file that saved in `directory` exercised, and which files they were. */
  static collect(directory: string): { coverage: ContractCoverage; testFiles: ReadonlySet<string> } {
    const coverage = new ContractCoverage()
    const testFiles = new Set<string>()
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
      const saved = record.parse(JSON.parse(readFileSync(join(directory, file), 'utf8')))
      testFiles.add(saved.testFile)
      for (const operationId of saved.operations) coverage.record(operationId)
    }
    return { coverage, testFiles }
  }

  /** Fails when an implemented operation was never exercised, naming each one. */
  assertCovers(implemented: Iterable<string>): void {
    const missing = [...implemented].filter((operationId) => !this.#exercised.has(operationId)).sort()
    if (missing.length > 0) {
      throw new Error(
        `The integration tests never exercised these implemented operations: ${missing.join(', ')}. ` +
          'Add a test that calls each one through the contract client.',
      )
    }
  }
}
