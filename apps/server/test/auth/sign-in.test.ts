import type { Schema } from '@draftroom/contract'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import { createPasswords, type Passwords } from '../../src/http/auth/passwords.ts'
import { bodyAs } from '../support/api.ts'
import { Browser, newAccount, sessionStackFor, setCookiesOf, type Account } from '../support/auth.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createTestApp, type TestApp } from '../support/test-app.ts'
import { createPendingPerson } from '../support/world.ts'

// Signing in (`signIn`): who is let in, and how little a refusal says.

const generous = { max: 1_000, windowMs: 60_000 }
const real = createPasswords()
/** The real passwords, with a note of every account a check was made against (`null` is an account that is not there). */
const checks: (string | null)[] = []
const watched: Passwords = {
  hash: real.hash,
  matches: (password, stored) => {
    checks.push(stored)
    return real.matches(password, stored)
  },
}

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
let account: Account
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  const stack = sessionStackFor(db)
  server = createTestApp(db, stack.withDevelopmentHeader, undefined, undefined, undefined, undefined, {
    session: stack,
    passwords: watched,
    rateLimits: { signInFailuresPerEmail: generous, signInFailuresPerAddress: generous, signUpsPerAddress: generous },
  })
  account = newAccount({ email: 'Marta.Ruiz@harborpine.example' })
  await new Browser(server).request({ method: 'POST', url: '/api/auth/sign-up', body: account })
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

const signIn = (browser: Browser, email: string, password: string) =>
  browser.request({ method: 'POST', url: '/api/auth/sign-in', body: { email, password } })

describe('signing in with the right address and password', () => {
  it('answers with the person and starts a session, which is who they are afterwards', async () => {
    const browser = new Browser(server)

    const response = await signIn(browser, account.email, account.password)

    expect(response.statusCode).toBe(200)
    expect(bodyAs<Schema<'User'>>(response)).toEqual({
      id: expect.any(String),
      email: account.email,
      name: account.name,
    })
    expect(Object.keys(setCookiesOf(response)).sort()).toEqual(['dr_csrf', 'dr_device', 'dr_session'])
    expect((await browser.request({ method: 'GET', url: '/api/me' })).statusCode).toBe(200)
  })

  it('does not tell one case of the address from another', async () => {
    const response = await signIn(new Browser(server), account.email.toLowerCase(), account.password)

    expect(response.statusCode).toBe(200)
  })

  it('is a new session each time, so two devices are two sessions', async () => {
    const [first, second] = [new Browser(server), new Browser(server)]
    await signIn(first, account.email, account.password)
    await signIn(second, account.email, account.password)

    expect(first.cookies.get('dr_session')).not.toBe(second.cookies.get('dr_session'))
    expect((await first.request({ method: 'GET', url: '/api/me' })).statusCode).toBe(200)
    expect((await second.request({ method: 'GET', url: '/api/me' })).statusCode).toBe(200)
  })
})

describe('what a refusal says', () => {
  it('is the same for a wrong password, an address with no account and an invited address that never signed up', async () => {
    const invited = await createPendingPerson(db)
    const attempts = [
      ['a wrong password', account.email, 'not the password at all'],
      ['an address with no account', 'nobody@harborpine.example', account.password],
      ['an invited address that never signed up', invited.email, account.password],
    ] as const

    const responses = await Promise.all(
      attempts.map(([, email, password]) => signIn(new Browser(server), email, password)),
    )

    for (const response of responses) {
      expect(response).toMatchObject({ statusCode: 401, body: { code: 'unauthenticated' } })
    }
    // Nothing else tells them apart: not the body, not the headers that are not the date, and no cookie.
    const shape = ({ statusCode, body, headers }: (typeof responses)[number]) => ({
      statusCode,
      body,
      headers: { ...headers, date: undefined, 'x-request-id': undefined },
    })
    expect(responses.map(shape)).toEqual(responses.map(() => shape(responses[0]!)))
    expect(responses.map((response) => response.headers['set-cookie'])).toEqual([undefined, undefined, undefined])
  })

  it('does the same work for an address with no account as for one that has, so the time says nothing', async () => {
    checks.length = 0

    await signIn(new Browser(server), 'nobody-at-all@harborpine.example', account.password)
    await signIn(new Browser(server), account.email, 'not the password at all')

    // One check each: the first against nobody's hash (`null`), the second against the stored one.
    expect(checks).toHaveLength(2)
    expect(checks[0]).toBeNull()
    expect(checks[1]).toMatch(/^\$argon2id\$/)
  })

  it('starts no session for a refusal', async () => {
    const browser = new Browser(server)

    await signIn(browser, account.email, 'not the password at all')

    expect(browser.cookies.size).toBe(0)
  })

  it('is not a way to tell who has an account through the shape of the request either: an invalid one is refused first, whoever it names', async () => {
    const known = await signIn(new Browser(server), account.email, '')
    const unknown = await signIn(new Browser(server), 'nobody-at-all@harborpine.example', '')

    expect([known.statusCode, unknown.statusCode]).toEqual([400, 400])
    expect(known.body).toEqual(unknown.body)
  })
})

describe('a request that is not JSON', () => {
  // The login CSRF of docs/api/README.md: a form on another site can post to the address, but it cannot send JSON without a
  // preflight the server never grants, so a body that is not JSON must not sign anyone in.
  it.each([
    [
      'application/x-www-form-urlencoded',
      ({ email, password }: Account) => `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
    ],
    ['text/plain', ({ email, password }: Account) => JSON.stringify({ email, password })],
  ])('as %s does not sign anyone in', async (contentType, payloadOf) => {
    const response = await server.request({
      method: 'POST',
      url: '/api/auth/sign-in',
      headers: { 'content-type': contentType },
      payload: payloadOf(account),
    })

    expect(response).toMatchObject({ statusCode: 400, body: { code: 'validation-failed' } })
    expect(response.headers['set-cookie']).toBeUndefined()
  })
})
