import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { appWithoutDatabase } from '../../test/support/app-without-database.ts'
import { developmentHardening } from '../../test/support/hardening.ts'
import { securityHeaders } from './security.ts'

// What every answer of the API carries, whatever the answer is (ADR 0017).

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
})

const production = { ...developmentHardening, production: true }
const strictTransportSecurity = 'strict-transport-security'

describe('the security headers of the API', () => {
  it('say that an answer is data about someone: nothing to load, no frame, no guessing of its type, no referrer, no cache', () => {
    expect(securityHeaders({ production: false })).toEqual({
      'content-security-policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()',
    })
  })

  it('add HSTS in production and only there', () => {
    expect(securityHeaders({ production: true })[strictTransportSecurity]).toBe('max-age=31536000')
    expect(securityHeaders({ production: false })).not.toHaveProperty(strictTransportSecurity)
  })
})

describe('the answers that carry them', () => {
  const requests = [
    ['an answer of the contract', { method: 'GET', url: '/api/health/live' }, 200],
    ['a route that does not exist', { method: 'GET', url: '/api/nothing' }, 404],
    ['a refusal of the session', { method: 'GET', url: '/api/me' }, 401],
    [
      'a request that fails inside a handler',
      { method: 'GET', url: '/api/me', headers: { 'x-test-session': 's' } },
      500,
    ],
    [
      'a body that is not JSON',
      { method: 'POST', url: '/api/auth/sign-in', payload: 'x', headers: { 'content-type': 'text/plain' } },
      400,
    ],
  ] as const

  it.each(requests)('are on %s', async (_name, request, status) => {
    app = appWithoutDatabase({ hardening: production })

    const response = await app.inject(request)

    expect(response.statusCode).toBe(status)
    for (const [name, value] of Object.entries(securityHeaders({ production: true }))) {
      expect(response.headers[name], name).toBe(value)
    }
  })

  it('leave out HSTS in development, where the server is plain HTTP', async () => {
    app = appWithoutDatabase()

    const response = await app.inject('/api/health/live')

    expect(response.headers).not.toHaveProperty(strictTransportSecurity)
    expect(response.headers['x-content-type-options']).toBe('nosniff')
  })
})
