import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import { Browser, newAccount, sessionStackFor, type SessionStack } from '../support/auth.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { contract, createTestApp, type TestApp } from '../support/test-app.ts'

// CSRF on every method that changes something (threat table, `auth/csrf.test.ts`): the contract says which operations
// those are, and this walks all of them, so an operation added later without the check cannot go unnoticed.

const generous = { max: 10_000, windowMs: 60_000 }

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
let stack: SessionStack
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  stack = sessionStackFor(db)
  // The production provider: the development header is not part of what is under test.
  server = createTestApp(db, stack.provider, undefined, undefined, undefined, undefined, {
    session: stack,
    // Every row signs someone up from the same address, which is exactly what the limit is for.
    rateLimits: { signInFailuresPerEmail: generous, signInFailuresPerAddress: generous, signUpsPerAddress: generous },
  })
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

const changesState = [...contract.operations.values()].filter(({ security }) => security.csrf)
const reads = [...contract.operations.values()].filter(({ security }) => security.session && !security.csrf)

/** The path of an operation with an id where each parameter goes: the checks that come first do not look at it. */
const urlOf = (path: string): string => path.replaceAll(/\{[^}]+\}/g, () => randomUUID())

async function signedUp(): Promise<{ browser: Browser; token: string }> {
  const browser = new Browser(server)
  const account = newAccount()
  await browser.request({ method: 'POST', url: '/api/auth/sign-up', body: account })
  return { browser, token: browser.cookies.get('dr_session') ?? '' }
}

describe('the operations that change something, as the contract lists them', () => {
  it('are many, and include the ones that matter most, so the rows below are not an empty table', () => {
    const ids = changesState.map(({ id }) => id)

    expect(ids.length).toBeGreaterThan(25)
    expect(ids).toEqual(expect.arrayContaining(['signOut', 'createDocument', 'setAccess', 'restoreVersion']))
  })

  it.each(changesState.map((operation) => [operation.id, operation.method, operation.path] as const))(
    '%s needs the token of the session: without it, or with a wrong one, the answer is 403 csrf',
    async (_id, method, path) => {
      const { browser } = await signedUp()
      const url = urlOf(path)

      const withoutHeader = await browser.request({ method, url, sendCsrf: false })
      const wrongHeader = await browser.request({
        method,
        url,
        sendCsrf: false,
        headers: { 'x-csrf-token': 'a-guess' },
      })

      expect([withoutHeader.statusCode, wrongHeader.statusCode]).toEqual([403, 403])
      expect([withoutHeader.body, wrongHeader.body]).toEqual([
        expect.objectContaining({ code: 'csrf' }),
        expect.objectContaining({ code: 'csrf' }),
      ])
    },
  )

  it.each(changesState.map((operation) => [operation.id, operation.method, operation.path] as const))(
    '%s is a 401 for a request with no session, even with a token, because the session is asked for first',
    async (_id, method, path) => {
      const response = await new Browser(server).request({
        method,
        url: urlOf(path),
        headers: { 'x-csrf-token': 'whatever', cookie: 'dr_csrf=whatever' },
      })

      expect(response).toMatchObject({ statusCode: 401, body: { code: 'unauthenticated' } })
    },
  )
})

describe('a token that is not the session’s', () => {
  it('is refused though the cookie and the header agree, when it is the token of another session', async () => {
    const [victim, attacker] = [await signedUp(), await signedUp()]
    const theirs = stack.csrf.tokenFor(attacker.token)

    const response = await victim.browser.request({
      method: 'POST',
      url: '/api/auth/sign-out',
      sendCsrf: false,
      headers: { cookie: `dr_session=${victim.token}; dr_csrf=${theirs}`, 'x-csrf-token': theirs },
    })

    expect(response).toMatchObject({ statusCode: 403, body: { code: 'csrf' } })
  })

  it('is refused when a cookie was planted with a value of the attacker’s choosing and the header repeats it', async () => {
    const victim = await signedUp()

    const response = await victim.browser.request({
      method: 'POST',
      url: '/api/auth/sign-out',
      sendCsrf: false,
      headers: { cookie: `dr_session=${victim.token}; dr_csrf=planted`, 'x-csrf-token': 'planted' },
    })

    expect(response).toMatchObject({ statusCode: 403, body: { code: 'csrf' } })
  })
})

describe('a request with the token of its session', () => {
  it('goes through, which is what makes the refusals above mean something', async () => {
    const { browser } = await signedUp()

    const response = await browser.request({ method: 'POST', url: '/api/auth/sign-out' })

    expect(response.statusCode).toBe(204)
  })
})

describe('the operations that only read', () => {
  it('ask for a session and no token', async () => {
    const { browser } = await signedUp()

    const answers = await Promise.all(
      reads
        .filter(({ id }) => ['getMe', 'listWorkspaces'].includes(id))
        .map(({ method, path }) => browser.request({ method, url: urlOf(path), sendCsrf: false })),
    )

    expect(answers.map(({ statusCode }) => statusCode)).toEqual([200, 200])
  })
})

describe('the operations that need no session', () => {
  it('do not ask for the token either: signing up and signing in come before there is one', async () => {
    const browser = new Browser(server)
    const account = newAccount()

    const signUp = await browser.request({ method: 'POST', url: '/api/auth/sign-up', body: account, sendCsrf: false })
    const signIn = await new Browser(server).request({
      method: 'POST',
      url: '/api/auth/sign-in',
      body: { email: account.email, password: account.password },
      sendCsrf: false,
    })

    expect([signUp.statusCode, signIn.statusCode]).toEqual([201, 200])
  })
})
