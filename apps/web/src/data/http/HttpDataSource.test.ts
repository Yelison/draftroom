import { afterEach, describe, expect, it } from 'vitest'
import { ApiError, isApiError, TransportError } from '../errors.ts'
import { createHttpDataSource } from './HttpDataSource.ts'

const workspaceId = '5f0f4c9e-2b1c-4a8e-9d0e-3a6b7c8d9e01'
const documentId = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

// Node builds a `Request` only from an absolute address; in the browser the relative paths resolve against the page.
const origin = 'http://app.test'

/** A data source whose transport records each request and answers with `respond`. */
function connect(respond: (request: Request) => Response | Promise<Response>, csrfToken?: string) {
  const requests: Request[] = []
  const source = createHttpDataSource({
    baseUrl: origin,
    fetch: async (request) => {
      requests.push(request)
      return respond(request)
    },
    csrfToken: () => csrfToken,
  })
  return { source, requests }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const problem = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: Number(body.status),
    headers: { 'Content-Type': 'application/problem+json' },
  })

const notFound = { type: 'about:blank', title: 'Not found', status: 404, code: 'not-found' }

describe('HttpDataSource requests', () => {
  it('sends the session cookie with every request', async () => {
    const { source, requests } = connect(() => json({ id: workspaceId }))

    await source.getWorkspace({ params: { path: { workspaceId } } })

    expect(requests[0]?.credentials).toBe('include')
  })

  it('puts path and query parameters in the address the contract defines', async () => {
    const { source, requests } = connect(() => json({ items: [], nextCursor: null }))

    await source.listDocuments({ params: { path: { workspaceId }, query: { limit: 10, archived: true } } })

    const url = new URL(requests[0]?.url ?? '')
    expect(url.pathname).toBe(`/api/workspaces/${workspaceId}/documents`)
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '10', archived: 'true' })
  })

  it('sends a JSON body', async () => {
    const { source, requests } = connect(() => json({ id: documentId }))

    await source.updateDocument({ params: { path: { documentId } }, body: { title: 'Plan', revision: 3 } })

    expect(requests[0]?.method).toBe('PATCH')
    expect(requests[0]?.headers.get('Content-Type')).toBe('application/json')
    expect(await requests[0]?.json()).toEqual({ title: 'Plan', revision: 3 })
  })

  it.each([
    [
      'createDocument',
      (source: ReturnType<typeof connect>['source']) =>
        source.createDocument({ params: { path: { workspaceId } }, body: { title: 'Plan' } }),
    ],
    [
      'pinDocument',
      (source: ReturnType<typeof connect>['source']) => source.pinDocument({ params: { path: { documentId } } }),
    ],
    [
      'updateDocument',
      (source: ReturnType<typeof connect>['source']) =>
        source.updateDocument({ params: { path: { documentId } }, body: { revision: 1 } }),
    ],
    [
      'deleteDocument',
      (source: ReturnType<typeof connect>['source']) => source.deleteDocument({ params: { path: { documentId } } }),
    ],
  ])('echoes the CSRF token on %s, a method that changes state', async (_name, call) => {
    const { source, requests } = connect(() => new Response(null, { status: 204 }), 'token-1')

    await call(source).catch(() => undefined)

    expect(requests[0]?.headers.get('X-CSRF-Token')).toBe('token-1')
  })

  it('does not send the CSRF token on a read', async () => {
    const { source, requests } = connect(() => json({ items: [] }), 'token-1')

    await source.listWorkspaces()

    expect(requests[0]?.headers.has('X-CSRF-Token')).toBe(false)
  })

  it('sends no token when the server has not set one, and lets the server refuse it', async () => {
    const { source, requests } = connect(() =>
      problem({ type: 'about:blank', title: 'CSRF', status: 403, code: 'csrf' }),
    )

    await expect(source.signOut()).rejects.toMatchObject({ code: 'csrf' })
    expect(requests[0]?.headers.has('X-CSRF-Token')).toBe(false)
  })

  it('reads the base address from its option', async () => {
    const requests: Request[] = []
    const source = createHttpDataSource({
      baseUrl: 'https://api.example.test',
      fetch: async (request) => {
        requests.push(request)
        return json({ id: 'x', email: 'a@b.example', name: 'A' })
      },
    })

    await source.getMe()

    expect(requests[0]?.url).toBe('https://api.example.test/api/me')
  })
})

describe('HttpDataSource CSRF token from the cookie', () => {
  afterEach(() => {
    document.cookie = 'dr_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('echoes the dr_csrf cookie of the page, which is where the server sets it', async () => {
    document.cookie = 'dr_csrf=from-the-cookie'
    const requests: Request[] = []
    const source = createHttpDataSource({
      baseUrl: origin,
      fetch: async (request) => {
        requests.push(request)
        return new Response(null, { status: 204 })
      },
    })

    await source.signOut()

    expect(requests[0]?.headers.get('X-CSRF-Token')).toBe('from-the-cookie')
  })
})

describe('HttpDataSource answers', () => {
  it('resolves with the body of a success', async () => {
    const { source } = connect(() => json({ id: workspaceId, name: 'Harbor Pine', role: 'owner', createdAt: 'x' }))

    await expect(source.getWorkspace({ params: { path: { workspaceId } } })).resolves.toMatchObject({
      name: 'Harbor Pine',
    })
  })

  it('resolves with nothing for a 204', async () => {
    const { source } = connect(() => new Response(null, { status: 204 }), 't')

    await expect(source.pinDocument({ params: { path: { documentId } } })).resolves.toBeUndefined()
  })

  it('returns the version download as bytes', async () => {
    const { source, requests } = connect(
      () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'application/octet-stream' } }),
    )

    const content = await source.getVersionContent({ params: { path: { versionId: documentId } } })

    expect(content).toEqual(new Uint8Array([1, 2, 3]))
    expect(requests[0]?.url).toContain('/content')
  })

  it('rejects a problem with the stable code, the status and the field errors', async () => {
    const { source } = connect(() =>
      problem({
        type: 'about:blank',
        title: 'Validation failed',
        status: 400,
        code: 'validation-failed',
        errors: [{ pointer: '/title', code: 'required' }],
      }),
    )

    const error = await source
      .createDocument({ params: { path: { workspaceId } }, body: { title: '' } })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: 'validation-failed',
      status: 400,
      fieldErrors: [{ pointer: '/title', code: 'required' }],
    })
  })

  it('carries the current resource of a revision conflict', async () => {
    const current = { id: documentId, revision: 4 }
    const { source } = connect(() =>
      problem({ type: 'about:blank', title: 'Stale', status: 409, code: 'revision-conflict', current }),
    )

    const error = await source
      .updateDocument({ params: { path: { documentId } }, body: { title: 'X', revision: 2 } })
      .catch((caught: unknown) => caught)

    expect(isApiError(error, 'revision-conflict') && error.problem).toMatchObject({ current })
  })

  it('does not take a problem whose code the contract does not define for one', async () => {
    const { source } = connect(() => problem({ ...notFound, code: 'teapot' }))

    await expect(source.getMe()).rejects.toBeInstanceOf(TransportError)
  })

  it('does not take for a problem a body that looks like one but is not served as application/problem+json', async () => {
    const { source } = connect(() => json(notFound, 404))

    await expect(source.getMe()).rejects.toBeInstanceOf(TransportError)
  })

  it('rejects a gateway page with a transport error that has the status and no code', async () => {
    const { source } = connect(
      () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }),
    )

    const error = await source.getMe().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TransportError)
    expect(error).toMatchObject({ status: 502 })
    expect(error).not.toHaveProperty('code')
  })

  it('rejects a failed connection with a transport error that keeps its cause', async () => {
    const cause = new TypeError('Failed to fetch')
    const { source } = connect(() => {
      throw cause
    })

    const error = await source.getMe().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TransportError)
    expect(error).toMatchObject({ status: null, cause })
  })
})
