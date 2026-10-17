import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { appWithoutDatabase } from '../../test/support/app-without-database.ts'
import { maxRequestBodyBytes } from './app.ts'
import { isReference, readContractDocument, type ContractDocument } from './contract-document.ts'

// How much of a request the server reads before it refuses (ADR 0017), answered as the contract says: `413 too-large`.

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
})

/** A JSON object of exactly `bytes` bytes, made of one field that is only padding. */
function bodyOfBytes(bytes: number): string {
  const frame = '{"padding":""}'
  return `{"padding":"${'x'.repeat(bytes - frame.length)}"}`
}

const send = (application: FastifyInstance, payload: string, headers: Record<string, string> = {}) =>
  application.inject({
    method: 'POST',
    url: '/api/auth/sign-in',
    payload,
    headers: { 'content-type': 'application/json', ...headers },
  })

describe('the size of a request body', () => {
  it('is read up to the limit: a body of exactly that many bytes reaches the checks of its shape', async () => {
    app = appWithoutDatabase()

    const response = await send(app, bodyOfBytes(maxRequestBodyBytes))

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'validation-failed' })
  })

  it('is refused with the contract’s 413 when it is one byte over, without being parsed', async () => {
    app = appWithoutDatabase()

    const response = await send(app, bodyOfBytes(maxRequestBodyBytes + 1))

    expect(response.statusCode).toBe(413)
    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(response.json()).toEqual({
      type: '/problems/too-large',
      title: 'A value exceeds its limit.',
      status: 413,
      code: 'too-large',
    })
  })

  it('is refused on the length it declares, before it is sent', async () => {
    app = appWithoutDatabase()

    const response = await send(app, '{}', { 'content-length': String(maxRequestBodyBytes * 100) })

    expect(response.statusCode).toBe(413)
  })

  it('is no excuse to skip the session: a caller who is not signed in is told so, whatever they send', async () => {
    app = appWithoutDatabase()

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      payload: bodyOfBytes(maxRequestBodyBytes + 1),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.statusCode).toBe(401)
  })
})

describe('the limit that is decided', () => {
  it('is 64 KiB: more than any body the contract allows, and little enough that a flood of them costs nothing', () => {
    expect(maxRequestBodyBytes).toBe(64 * 1024)
  })
})

describe('the limit and the contract', () => {
  // A JSON string escapes a control character as six bytes (\u0001); a character outside the basic plane takes four as
  // UTF-8, or twelve if a client escapes both halves of its surrogate pair. Six is the most a client that serialises
  // normally sends, and a body that needs twelve is not one a person wrote.
  const bytesPerCodePoint = 6

  function textLimits(document: ContractDocument, schema: object): number {
    if (isReference(schema)) {
      const target = document.components.schemas[schema.$ref.replace('#/components/schemas/', '')]
      return typeof target === 'object' && target !== null ? textLimits(document, target) : 0
    }
    const own = 'maxLength' in schema && typeof schema.maxLength === 'number' ? schema.maxLength : 0
    const members =
      'properties' in schema && typeof schema.properties === 'object' && schema.properties !== null
        ? Object.values(schema.properties)
        : []
    return own + members.reduce<number>((sum, member) => sum + textLimits(document, member as object), 0)
  }

  it('holds the biggest legitimate body of any operation, with every text at its maximum', () => {
    const document = readContractDocument()
    const bodies = Object.values(document.paths)
      .flatMap((methods) => Object.values(methods))
      .flatMap((operation) => {
        const schema =
          typeof operation === 'object' && operation !== null && 'requestBody' in operation
            ? (operation.requestBody as { content?: Record<string, { schema?: object }> }).content?.['application/json']
                ?.schema
            : undefined
        return schema === undefined ? [] : [textLimits(document, schema) * bytesPerCodePoint]
      })

    expect(bodies.length).toBeGreaterThan(0)
    expect(Math.max(...bodies)).toBeLessThanOrEqual(maxRequestBodyBytes)
  })
})
