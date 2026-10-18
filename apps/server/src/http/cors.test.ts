import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { appWithoutDatabase } from '../../test/support/app-without-database.ts'
import { developmentHardening } from '../../test/support/hardening.ts'

// Which pages may read the answers of the API, and with their cookies (ADR 0017). Nothing here decides who may call.

const app_ = 'https://draftroom.example'
const stranger = 'https://evil.example'

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
})

const appAllowing = (...allowedOrigins: string[]) => {
  app = appWithoutDatabase({ hardening: { ...developmentHardening, allowedOrigins } })
  return app
}

describe('an answer to a page of another origin', () => {
  it('is readable, with cookies, by an origin on the list', async () => {
    const response = await appAllowing(app_).inject({ url: '/api/health/live', headers: { origin: app_ } })

    expect(response.headers).toMatchObject({
      'access-control-allow-origin': app_,
      'access-control-allow-credentials': 'true',
      'access-control-expose-headers': 'Retry-After',
      vary: 'Origin',
    })
  })

  it.each([
    ['an origin that is not on the list', stranger],
    ['the same host on another scheme', 'http://draftroom.example'],
    ['the same host on another port', 'https://draftroom.example:8443'],
    ['a subdomain of one on the list', 'https://sub.draftroom.example'],
    ['the opaque origin of a sandboxed frame', 'null'],
  ])('is not readable by %s', async (_name, origin) => {
    const response = await appAllowing(app_).inject({ url: '/api/health/live', headers: { origin } })

    expect(response.statusCode).toBe(200)
    expect(Object.keys(response.headers).filter((name) => name.startsWith('access-control-'))).toEqual([])
    expect(response.headers['vary']).toBe('Origin')
  })

  it('says nothing about CORS when no page asked', async () => {
    const response = await appAllowing(app_).inject('/api/health/live')

    expect(Object.keys(response.headers).filter((name) => name.startsWith('access-control-'))).toEqual([])
    expect(response.headers).not.toHaveProperty('vary')
  })

  it('never says `*`, to an origin on the list or to any other', async () => {
    const answers = await Promise.all(
      [app_, stranger].map((origin) => appAllowing(app_).inject({ url: '/api/health/live', headers: { origin } })),
    )

    for (const { headers } of answers) expect(Object.values(headers)).not.toContain('*')
  })

  it('is not readable by anybody when the list is empty, as in development', async () => {
    const response = await appAllowing().inject({ url: '/api/health/live', headers: { origin: app_ } })

    expect(response.headers).not.toHaveProperty('access-control-allow-origin')
  })
})

describe('the preflight', () => {
  const preflight = (origin: string) => ({
    method: 'OPTIONS' as const,
    url: '/api/documents',
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type, x-csrf-token',
    },
  })

  it('tells an origin on the list what it may send, and for how long it may remember it', async () => {
    const response = await appAllowing(app_).inject(preflight(app_))

    expect(response.statusCode).toBe(204)
    expect(response.headers).toMatchObject({
      'access-control-allow-origin': app_,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE',
      'access-control-allow-headers': 'Content-Type, X-CSRF-Token',
      'access-control-max-age': '600',
    })
    expect(response.headers['vary']).toContain('Origin')
  })

  it('never allows the development identity header, so no other site can use it', async () => {
    const response = await appAllowing(app_).inject(preflight(app_))

    expect(String(response.headers['access-control-allow-headers']).toLowerCase()).not.toContain('x-dev-user')
  })

  it('gives an origin that is not on the list nothing to go by, which is how a browser is told no', async () => {
    const response = await appAllowing(app_).inject(preflight(stranger))

    expect(response.statusCode).toBe(204)
    expect(Object.keys(response.headers).filter((name) => name.startsWith('access-control-'))).toEqual([])
  })

  it('is left to the router when it is not a preflight, which has no OPTIONS routes', async () => {
    const response = await appAllowing(app_).inject({
      method: 'OPTIONS',
      url: '/api/documents',
      headers: { origin: app_ },
    })

    expect(response.statusCode).toBe(404)
  })
})
