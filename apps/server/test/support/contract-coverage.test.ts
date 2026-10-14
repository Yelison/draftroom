import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ContractCoverage } from './contract-coverage.ts'

function coverageOf(...operationIds: string[]): ContractCoverage {
  const coverage = new ContractCoverage()
  for (const operationId of operationIds) coverage.record(operationId)
  return coverage
}

describe('ContractCoverage', () => {
  it('passes when every implemented operation was exercised', () => {
    expect(() =>
      coverageOf('getLiveness', 'getReadiness', 'getMe').assertCovers(['getLiveness', 'getReadiness']),
    ).not.toThrow()
  })

  it('fails when an implemented operation was never exercised, and names it', () => {
    expect(() => coverageOf('getLiveness').assertCovers(['getLiveness', 'getReadiness', 'createDocument'])).toThrow(
      /createDocument, getReadiness/,
    )
  })

  it('does not mind an operation that was exercised and is not implemented', () => {
    expect(() => coverageOf('getMe').assertCovers([])).not.toThrow()
  })

  describe('across test files', () => {
    let directory: string
    beforeEach(() => {
      directory = mkdtempSync(join(tmpdir(), 'draftroom-coverage-test-'))
    })
    afterEach(() => {
      rmSync(directory, { recursive: true, force: true })
    })

    it('adds up what each file saved, and remembers which files ran', () => {
      coverageOf('getLiveness').save(directory, '/tests/health.test.ts')
      coverageOf('getReadiness').save(directory, '/tests/ready.test.ts')
      coverageOf().save(directory, '/tests/migrations.test.ts')

      const { coverage, testFiles } = ContractCoverage.collect(directory)

      expect(coverage.exercised).toEqual(['getLiveness', 'getReadiness'])
      expect([...testFiles].sort()).toEqual([
        '/tests/health.test.ts',
        '/tests/migrations.test.ts',
        '/tests/ready.test.ts',
      ])
    })

    it('keeps one record per file when it saves twice', () => {
      coverageOf('getLiveness').save(directory, '/tests/health.test.ts')
      coverageOf('getLiveness', 'getReadiness').save(directory, '/tests/health.test.ts')

      expect(ContractCoverage.collect(directory).coverage.exercised).toEqual(['getLiveness', 'getReadiness'])
    })
  })
})
