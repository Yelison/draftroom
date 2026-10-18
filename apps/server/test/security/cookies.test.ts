import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import { Browser, newAccount, sessionStackFor, setCookiesOf, type Account, type SessionStack } from '../support/auth.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createTestApp, type TestApp } from '../support/test-app.ts'

// The names of the cookies and what they protect (ADR 0004): behind HTTPS the cookies are `__Host-` cookies, which a
// sibling subdomain cannot plant, and the server reads no other name.

let database: TestDatabase
let db: Kysely<Database>
let production: { stack: SessionStack; server: TestApp }
let development: { stack: SessionStack; server: TestApp }
let account: Account

function appFor(secure: boolean) {
  const stack = sessionStackFor(db, { secure })
  const server = createTestApp(db, stack.provider, undefined, undefined, undefined, undefined, { session: stack })
  return { stack, server }
}

beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  production = appFor(true)
  development = appFor(false)
  account = newAccount()
  await new Browser(development.server).request({ method: 'POST', url: '/api/auth/sign-up', body: account })
})
afterAll(async () => {
  await Promise.all([production.server.app.close(), development.server.app.close()])
  await database.drop()
})

const productionBrowser = () => new Browser(production.server, production.stack.names)
const signIn = (browser: Browser) =>
  browser.request({
    method: 'POST',
    url: '/api/auth/sign-in',
    body: { email: account.email, password: account.password },
  })
const me = (browser: Browser, headers: Record<string, string> = {}) =>
  browser.request({ method: 'GET', url: '/api/me', headers })

describe('the cookies of a server behind HTTPS', () => {
  it('are __Host- cookies: Secure, on the whole site and with no Domain, which is what a browser asks of the prefix', async () => {
    const response = await signIn(productionBrowser())

    const cookies = setCookiesOf(response)
    expect(Object.keys(cookies).sort()).toEqual(['__Host-dr_csrf', '__Host-dr_device', '__Host-dr_session'])
    for (const cookie of Object.values(cookies)) {
      expect(cookie).toMatchObject({ secure: true, path: '/', domain: undefined })
    }
  })

  it('are plain dr_ cookies in development, where a Secure cookie would never come back over HTTP', async () => {
    const response = await signIn(new Browser(development.server))

    const cookies = setCookiesOf(response)
    expect(Object.keys(cookies).sort()).toEqual(['dr_csrf', 'dr_device', 'dr_session'])
    expect(Object.values(cookies).map(({ secure }) => secure)).toEqual([false, false, false])
  })

  it('make a session, and a request that changes something needs the CSRF cookie under the same name', async () => {
    const browser = productionBrowser()
    await signIn(browser)

    expect((await me(browser)).statusCode).toBe(200)
    expect((await browser.request({ method: 'POST', url: '/api/auth/sign-out' })).statusCode).toBe(204)
    expect((await me(browser)).statusCode).toBe(401)
  })
})

describe('cookie tossing: a cookie planted from a sibling subdomain', () => {
  // A browser sends the cookie with the longer path first, so one planted with `Path=/api` arrives before the real one
  // that has `Path=/`. The plain name is the only one a sibling can choose: the browser refuses to set a `__Host-` one.
  it('does not win when it comes first: the server reads the __Host- name only', async () => {
    const signedIn = productionBrowser()
    await signIn(signedIn)
    const realToken = signedIn.cookies.get('__Host-dr_session') ?? ''
    const victim = productionBrowser()
    victim.plant('dr_session', 'a-session-the-attacker-chose')
    victim.plant('__Host-dr_session', realToken)

    const response = await me(victim)

    expect(response.statusCode).toBe(200)
  })

  it('is no session at all: a plain dr_session, even a valid one, is not read by a server behind HTTPS', async () => {
    const signedIn = productionBrowser()
    await signIn(signedIn)
    const plain = productionBrowser()
    plain.plant('dr_session', signedIn.cookies.get('__Host-dr_session') ?? '')

    const response = await me(plain)

    expect(response.statusCode).toBe(401)
  })

  it('cannot supply the CSRF token either: a plain dr_csrf is not the cookie the check reads', async () => {
    const browser = productionBrowser()
    await signIn(browser)
    const token = browser.cookies.get('__Host-dr_csrf') ?? ''
    browser.cookies.delete('__Host-dr_csrf')
    browser.plant('dr_csrf', token)

    const response = await browser.request({
      method: 'POST',
      url: '/api/auth/sign-out',
      sendCsrf: false,
      headers: { 'x-csrf-token': token },
    })

    expect(response.statusCode).toBe(403)
  })
})
