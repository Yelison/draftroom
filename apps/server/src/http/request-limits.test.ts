import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { appWithoutDatabase } from '../../test/support/app-without-database.ts'
import { developmentHardening } from '../../test/support/hardening.ts'
import { defaultRequestLimits, type RequestLimits } from './request-limits.ts'

// The limits on how many requests an address and a session may send (ADR 0017). A bucket that refills very slowly makes
// a count of what is let through exact, whatever time the test takes.

const slow = { perSecond: 0.001 }
const limits = (perAddress: number, perSession: number): RequestLimits => ({
  perAddress: { ...slow, burst: perAddress },
  perSession: { ...slow, burst: perSession },
})

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
})

const statuses = async (application: FastifyInstance, count: number, request: InjectOptions) =>
  (await Promise.all(Array.from({ length: count }, () => application.inject(request)))).map(
    ({ statusCode }) => statusCode,
  )
const tally = (codes: readonly number[]) => ({
  limited: codes.filter((code) => code === 429).length,
  served: codes.filter((code) => code !== 429).length,
})

describe('the limit by address', () => {
  it('lets an address send its burst at once and refuses the rest, with the time to wait', async () => {
    app = appWithoutDatabase({ requestLimits: limits(5, 1000) })

    const answers = await Promise.all(
      Array.from({ length: 12 }, () => app!.inject({ method: 'GET', url: '/api/nothing' })),
    )

    expect(tally(answers.map(({ statusCode }) => statusCode))).toEqual({ served: 5, limited: 7 })
    const refused = answers.find(({ statusCode }) => statusCode === 429)
    expect(refused?.json()).toMatchObject({ code: 'rate-limited', status: 429 })
    expect(refused?.headers['content-type']).toContain('application/problem+json')
    expect(Number(refused?.headers['retry-after'])).toBeGreaterThanOrEqual(1)
  })

  it('counts a caller who is not signed in, which is what keeps a flood off the database', async () => {
    app = appWithoutDatabase({ requestLimits: limits(3, 1000) })

    const codes = await statuses(app, 6, { method: 'GET', url: '/api/me' })

    expect(tally(codes)).toEqual({ served: 3, limited: 3 })
    expect(codes.filter((code) => code !== 429)).toEqual([401, 401, 401])
  })

  it('refuses before the session is looked at, and so before a body is read', async () => {
    app = appWithoutDatabase({ requestLimits: limits(1, 1000) })
    await app.inject({ method: 'POST', url: '/api/auth/sign-in', payload: {} })

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      payload: 'not json',
      headers: { 'content-type': 'application/json' },
    })

    expect(response.statusCode).toBe(429)
  })

  it('never refuses the probes of an orchestrator or a proxy, which come from one address every few seconds', async () => {
    app = appWithoutDatabase({ requestLimits: limits(1, 1) })

    const codes = await statuses(app, 30, { method: 'GET', url: '/api/health/live' })

    expect(codes.every((code) => code === 200)).toBe(true)
  })

  it('counts each address on its own', async () => {
    app = appWithoutDatabase({ requestLimits: limits(2, 1000) })
    const from = (remoteAddress: string) => statuses(app!, 4, { method: 'GET', url: '/api/nothing', remoteAddress })

    const [first, second] = await Promise.all([from('198.51.100.1'), from('198.51.100.2')])

    expect([tally(first), tally(second)]).toEqual([
      { served: 2, limited: 2 },
      { served: 2, limited: 2 },
    ])
  })
})

describe('the limit by address, for IPv6', () => {
  it('counts the addresses of one /64 together, so a household cannot spend a bucket per address', async () => {
    app = appWithoutDatabase({ requestLimits: limits(3, 1000) })
    const from = (remoteAddress: string) => app!.inject({ method: 'GET', url: '/api/nothing', remoteAddress })

    const answers = await Promise.all(
      ['2001:db8:1:2::1', '2001:db8:1:2::2', '2001:db8:1:2:ffff::3', '2001:db8:1:2::4'].map(from),
    )
    const nextNetwork = await from('2001:db8:1:3::1')

    expect(tally(answers.map(({ statusCode }) => statusCode))).toEqual({ served: 3, limited: 1 })
    expect(nextNetwork.statusCode).not.toBe(429)
  })
})

describe('the limit by session', () => {
  const as = (session: string): InjectOptions => ({
    method: 'GET',
    url: '/api/me',
    headers: { 'x-test-session': session },
  })

  it('lets a session send its burst at once and refuses the rest, whatever the address', async () => {
    app = appWithoutDatabase({ requestLimits: limits(1000, 4) })

    const codes = await statuses(app, 10, as('session-a'))

    expect(tally(codes)).toEqual({ served: 4, limited: 6 })
  })

  it('counts each session on its own, so one person who is slowed down does not slow the others', async () => {
    app = appWithoutDatabase({ requestLimits: limits(1000, 3) })
    await statuses(app, 10, as('session-a'))

    const codes = await statuses(app, 3, as('session-b'))

    expect(tally(codes)).toEqual({ served: 3, limited: 0 })
  })

  it('follows the session from one address to another', async () => {
    app = appWithoutDatabase({ requestLimits: limits(1000, 3) })
    await statuses(app, 3, { ...as('session-a'), remoteAddress: '198.51.100.1' })

    const response = await app.inject({ ...as('session-a'), remoteAddress: '198.51.100.2' })

    expect(response.statusCode).toBe(429)
  })
})

describe('the limits that are decided', () => {
  it('let a person who works fast through: a hundred requests at once, and ten a second for ever', () => {
    expect(defaultRequestLimits.perSession).toEqual({ perSecond: 10, burst: 100 })
  })

  it('give an address five times what a session has, for an office or a household behind one', () => {
    expect(defaultRequestLimits.perAddress).toEqual({ perSecond: 50, burst: 500 })
  })
})

describe('who the address is', () => {
  const behindProxy = (trustProxy: string[] | false) => {
    app = appWithoutDatabase({
      hardening: { ...developmentHardening, trustProxy },
      requestLimits: limits(2, 1000),
    })
    return app
  }
  const viaProxy = (forwardedFor: string): InjectOptions => ({
    method: 'GET',
    url: '/api/nothing',
    remoteAddress: '10.0.0.5',
    headers: { 'x-forwarded-for': forwardedFor },
  })

  it('is the proxy when none is trusted, so a caller cannot choose their address by writing a header', async () => {
    const application = behindProxy(false)

    const codes = await Promise.all(
      ['203.0.113.1', '203.0.113.2', '203.0.113.3', '203.0.113.4'].map((address) =>
        application.inject(viaProxy(address)),
      ),
    ).then((answers) => answers.map(({ statusCode }) => statusCode))

    expect(tally(codes)).toEqual({ served: 2, limited: 2 })
  })

  it('is the one the trusted proxy saw when it is named, so every caller has a limit of their own', async () => {
    const application = behindProxy(['10.0.0.0/8'])

    const codes = await Promise.all(
      ['203.0.113.1', '203.0.113.2', '203.0.113.3', '203.0.113.4'].map((address) =>
        application.inject(viaProxy(address)),
      ),
    ).then((answers) => answers.map(({ statusCode }) => statusCode))

    expect(tally(codes)).toEqual({ served: 4, limited: 0 })
  })

  it('is still the caller when a proxy that is not trusted writes the header', async () => {
    const application = behindProxy(['10.0.0.0/8'])

    const codes = await Promise.all(
      ['203.0.113.1', '203.0.113.2', '203.0.113.3'].map((address) =>
        application.inject({ ...viaProxy(address), remoteAddress: '192.0.2.77' }),
      ),
    ).then((answers) => answers.map(({ statusCode }) => statusCode))

    expect(tally(codes)).toEqual({ served: 2, limited: 1 })
  })
})
