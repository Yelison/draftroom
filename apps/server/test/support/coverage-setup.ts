import { afterAll, expect, inject } from 'vitest'
import { runCoverage } from './run-coverage.ts'

// A setup file: it runs for every integration test file, so a file that exercises nothing is still counted as run.
afterAll(() => {
  const testFile = expect.getState().testPath
  if (testFile === undefined) throw new Error('The coverage setup needs the path of the test file')
  runCoverage.save(inject('contractCoverageDirectory'), testFile)
})
