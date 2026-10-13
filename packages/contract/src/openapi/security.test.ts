import { describe, expect, it } from 'vitest'
import { loadOpenApi } from './document.ts'

const { operations, securitySchemes } = loadOpenApi()

const publicOperations = ['getLiveness', 'getReadiness', 'signIn', 'signUp']
const isPublic = (id: string | undefined) => publicOperations.includes(id ?? '')

describe('security', () => {
  it('names the session cookie and the CSRF header', () => {
    expect(securitySchemes).toMatchObject({
      session: { type: 'apiKey', in: 'cookie', name: 'dr_session' },
      csrf: { type: 'apiKey', in: 'header', name: 'X-CSRF-Token' },
    })
  })

  it('leaves only health, sign-in and sign-up without a session', () => {
    const withoutSession = operations
      .filter((operation) => operation.security?.length === 0)
      .map((operation) => operation.id)

    expect(withoutSession.sort()).toEqual(publicOperations)
  })

  it('states the security of every operation explicitly', () => {
    const silent = operations.filter((operation) => operation.security === undefined).map((operation) => operation.key)

    expect(silent).toEqual([])
  })

  it('asks reads for the session alone', () => {
    const reads = operations.filter((operation) => operation.method === 'get' && !isPublic(operation.id))

    expect(reads.map((operation) => operation.security)).toEqual(reads.map(() => [{ session: [] }]))
  })

  // One requirement object means AND: two objects would mean OR and make the CSRF token optional.
  it('asks every method that changes state for the session and the CSRF token together', () => {
    const writes = operations.filter((operation) => operation.method !== 'get' && !isPublic(operation.id))

    expect(writes.map((operation) => operation.security)).toEqual(writes.map(() => [{ session: [], csrf: [] }]))
  })
})
