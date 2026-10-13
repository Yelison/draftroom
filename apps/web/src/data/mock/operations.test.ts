import { describe, expect, it, vi } from 'vitest'
import { checkedAgainstContract, loadContract } from '../testing/contract.ts'
import { calls } from '../testing/operationCalls.ts'
import { createMockServer } from './createMockDataSource.ts'
import { marta } from './fixtures/index.ts'
import { UnhandledOperationError, excludedOperations } from './unhandled.ts'

const contract = loadContract()

describe('the operations of the mock', () => {
  it.each(Object.entries(calls))('%s answers what the contract says', async (_operation, call) => {
    const api = checkedAgainstContract(createMockServer().connect({ signedInAs: marta.email }), contract)

    // A rejection, from the mock or from the contract check, fails the test with the operation named.
    await call(api)
  })

  it('leaves no operation of the contract without a call or an explicit, explained exclusion', () => {
    const accounted = new Set([...Object.keys(calls), ...Object.keys(excludedOperations)])

    expect(contract.operations.map((operation) => operation.id).filter((id) => !accounted.has(id))).toEqual([])
  })

  it('does not both implement and exclude an operation, or exclude one the contract lacks', () => {
    const ids = contract.operations.map((operation) => operation.id)

    expect(Object.keys(calls).filter((id) => id in excludedOperations)).toEqual([])
    expect(Object.keys(excludedOperations).filter((id) => !ids.includes(id))).toEqual([])
    expect(Object.values(excludedOperations).every((reason) => reason.length > 20)).toBe(true)
  })

  it('fails visibly on an operation it leaves out, saying why', async () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const api = createMockServer().connect({ signedInAs: marta.email })

    const error = await api
      .getVersionContent({ params: { path: { versionId: 'x' } } })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(UnhandledOperationError)
    expect(error).toMatchObject({ message: expect.stringContaining('Yjs') })
    expect(report).toHaveBeenCalledWith(expect.stringContaining('getVersionContent'))
    report.mockRestore()
  })
})
