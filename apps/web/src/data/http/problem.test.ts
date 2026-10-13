import { describe, expect, it } from 'vitest'
import { loadContract } from '../testing/contract.ts'
import { fieldErrorCodes } from './problem.ts'

describe('fieldErrorCodes', () => {
  it('lists exactly the codes of the contract', () => {
    const declared = loadContract().schema('FieldErrorCode').enum

    expect(Array.isArray(declared)).toBe(true)
    expect([...fieldErrorCodes].sort()).toEqual([...(Array.isArray(declared) ? declared : [])].sort())
  })
})
