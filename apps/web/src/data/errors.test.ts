import { describe, expect, it } from 'vitest'
import { ApiError, errorCodes, isApiError, TransportError } from './errors.ts'
import { loadContract } from './testing/contract.ts'

describe('errorCodes', () => {
  it('lists exactly the codes of the contract', () => {
    expect([...errorCodes].sort()).toEqual([...(loadContract().schema('ErrorCode').enum as string[])].sort())
  })
})

describe('ApiError', () => {
  const problem = { type: '/problems/not-found', title: 'Not found.', status: 404, code: 'not-found' } as const

  it('carries the status, the stable code and the problem', () => {
    const error = new ApiError(problem)

    expect(error).toMatchObject({ status: 404, code: 'not-found', problem })
    expect(error.fieldErrors).toEqual([])
  })

  it('exposes the field errors of a validation failure', () => {
    const errors = [{ pointer: '/title', code: 'required' }] as const

    const error = new ApiError({ ...problem, status: 400, code: 'validation-failed', errors: [...errors] })

    expect(error.fieldErrors).toEqual(errors)
  })

  it('is told apart from a transport failure, which has no code', () => {
    const transport = new TransportError(502)

    expect(isApiError(new ApiError(problem))).toBe(true)
    expect(isApiError(new ApiError(problem), 'forbidden')).toBe(false)
    expect(isApiError(transport)).toBe(false)
    expect(transport).not.toHaveProperty('code')
  })
})
