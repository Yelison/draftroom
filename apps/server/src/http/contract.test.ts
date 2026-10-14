import { beforeAll, describe, expect, it } from 'vitest'
import { loadContract, type Contract } from './contract.ts'

const workspaceId = '0b1f6d54-3c1a-4f55-9a43-6a7d2f5e8c01'

let contract: Contract
beforeAll(() => {
  contract = loadContract()
})

describe('the loaded contract', () => {
  it('has the operations of openapi.yaml, with their method and the path the router reads', () => {
    expect(contract.operation('getLiveness')).toMatchObject({
      method: 'GET',
      path: '/api/health/live',
      routePath: '/api/health/live',
    })
    expect(contract.operation('createDocument')).toMatchObject({
      method: 'POST',
      routePath: '/api/workspaces/:workspaceId/documents',
    })
    expect(contract.operations.size).toBeGreaterThan(40)
  })

  it('refuses an operation it does not have', () => {
    expect(() => contract.operation('dropEverything')).toThrow('no operation')
  })
})

describe('checkRequest', () => {
  const createDocument = () => contract.operation('createDocument')
  const request = (body: unknown, params: unknown = { workspaceId }) => ({ params, query: {}, body })

  it('accepts a request that follows the contract', () => {
    expect(createDocument().checkRequest(request({ title: 'Autumn launch plan' }))).toEqual({ ok: true })
  })

  const invalid: readonly (readonly [string, unknown, number, unknown])[] = [
    ['a missing field', {}, 400, { pointer: '/title', code: 'required' }],
    ['an empty title', { title: '' }, 400, { pointer: '/title', code: 'too-short' }],
    [
      'a field the contract does not have',
      { title: 'a', admin: true },
      400,
      { pointer: '/admin', code: 'unknown-field' },
    ],
    [
      'a folder id that is not a UUID',
      { title: 'a', folderId: 'x' },
      400,
      { pointer: '/folderId', code: 'invalid-format' },
    ],
    ['a locale without a template', { title: 'a', locale: 'es' }, 400, { pointer: '/templateId', code: 'required' }],
    ['a title over 200 characters', { title: 'a'.repeat(201) }, 413, { pointer: '/title', code: 'too-long' }],
  ]

  it.each(invalid)('refuses %s', (_name, body, status, error) => {
    const verdict = createDocument().checkRequest(request(body))

    expect(verdict).toMatchObject({ ok: false, status })
    expect(verdict).toHaveProperty('errors', expect.arrayContaining([error]))
  })

  it('reports every invalid field at once, so a form can show them together', () => {
    const verdict = createDocument().checkRequest(request({ title: '', folderId: 'x' }))

    expect(verdict).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        { pointer: '/title', code: 'too-short' },
        { pointer: '/folderId', code: 'invalid-format' },
      ]),
    })
  })

  it('counts a title in Unicode code points, so 200 emoji fit', () => {
    expect(createDocument().checkRequest(request({ title: '😀'.repeat(200) }))).toEqual({ ok: true })
    expect(createDocument().checkRequest(request({ title: '😀'.repeat(201) }))).toMatchObject({ status: 413 })
  })

  it('refuses a body that was required and never came', () => {
    expect(createDocument().checkRequest(request(undefined))).toMatchObject({
      ok: false,
      errors: [{ pointer: '/', code: 'required' }],
    })
  })

  it('refuses a path parameter that is not an id', () => {
    expect(createDocument().checkRequest(request({ title: 'a' }, { workspaceId: 'nope' }))).toMatchObject({
      errors: [{ pointer: '/path/workspaceId', code: 'invalid-format' }],
    })
  })

  describe('the query of a list', () => {
    const list = (query: unknown) =>
      contract.operation('listDocuments').checkRequest({ params: { workspaceId }, query, body: undefined })

    it('turns the strings of a query into the types the contract declares', () => {
      const query = { limit: '10', archived: 'true' }

      expect(list(query)).toEqual({ ok: true })
      expect(query).toEqual({ limit: 10, archived: true })
    })

    it('answers 400, never 413, for a query value out of range', () => {
      expect(list({ limit: '101' })).toMatchObject({ ok: false, status: 400, errors: [{ pointer: '/query/limit' }] })
      expect(list({ query: 'a'.repeat(201) })).toMatchObject({
        ok: false,
        status: 400,
        errors: [{ pointer: '/query/query', code: 'too-long' }],
      })
    })
  })
})

describe('checkResponse', () => {
  const live = () => contract.operation('getLiveness')
  const json = 'application/json; charset=utf-8'

  it('accepts a response that follows the contract', () => {
    expect(live().checkResponse(200, json, '{"status":"ok"}')).toEqual({ ok: true })
  })

  const broken: readonly (readonly [string, number, string | undefined, unknown, string])[] = [
    ['a body with a field the contract does not have', 200, json, '{"status":"ok","uptime":3}', 'uptime'],
    ['a value outside its enum', 200, json, '{"status":"fine"}', 'status'],
    ['a body that is not JSON', 200, json, 'ok', 'not valid JSON'],
    ['a status the operation declares only through its default, without a body', 204, undefined, '', 'media type'],
    ['a media type the status does not declare', 200, 'text/plain', 'ok', 'media type'],
    ['a body that is not text', 200, json, { status: 'ok' }, 'as text'],
  ]

  it.each(broken)('refuses %s', (_name, status, mediaType, payload, reason) => {
    expect(live().checkResponse(status, mediaType, payload)).toMatchObject({
      ok: false,
      reason: expect.stringContaining(reason),
    })
  })

  it('checks an error against the default response, as problem+json', () => {
    const problem = {
      type: '/problems/internal-error',
      title: 'Something went wrong.',
      status: 500,
      code: 'internal-error',
    }

    expect(live().checkResponse(500, 'application/problem+json', JSON.stringify(problem))).toEqual({ ok: true })
    expect(
      live().checkResponse(500, 'application/problem+json', JSON.stringify({ ...problem, code: 'oops' })),
    ).toMatchObject({ ok: false })
  })

  it('refuses a status that the operation does not declare and no default covers', () => {
    const small = loadContract({
      paths: { '/ping': { get: { operationId: 'ping', responses: { '200': { description: 'ok' } } } } },
      components: { parameters: {}, requestBodies: {}, responses: {}, schemas: {} },
    })

    expect(small.operation('ping').checkResponse(200, undefined, '')).toEqual({ ok: true })
    expect(small.operation('ping').checkResponse(500, undefined, '')).toMatchObject({
      reason: 'status 500 is not declared',
    })
  })

  it('does not inspect bytes', () => {
    expect(
      contract.operation('getVersionContent').checkResponse(200, 'application/octet-stream', Buffer.from([1, 2])),
    ).toEqual({ ok: true })
  })
})
