import { ContractCoverage } from './contract-coverage.ts'

/** What the tests of the current file have exercised; `coverage-setup.ts` saves it when the file ends. */
export const runCoverage = new ContractCoverage()
