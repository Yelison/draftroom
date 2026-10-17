import { Writable } from 'node:stream'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import { Browser, newAccount, sessionStackFor } from '../support/auth.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createTestApp, type TestApp } from '../support/test-app.ts'

// What the server writes while people sign up, sign in and out must say that it happened and never what proves who they
// are: the password, the session token, the CSRF token and the stored hash.

const generous = { max: 10_000, windowMs: 60_000 }
const lines: string[] = []
const logger = {
  level: 'trace',
  stream: new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString())
      done()
    },
  }),
}

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  const stack = sessionStackFor(db)
  server = createTestApp(db, stack.withDevelopmentHeader, undefined, logger, undefined, undefined, {
    session: stack,
    rateLimits: {
      signInFailuresPerEmail: { max: 2, windowMs: 60_000 },
      signInFailuresPerAddress: generous,
      signUpsPerAddress: generous,
    },
  })
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

describe('the log of the authentication flows', () => {
  it('holds no password, no session token, no CSRF token and no stored hash, though it records what happened', async () => {
    const secrets: string[] = []
    const account = newAccount({ password: 'the-sign-up-password-9f3a' })
    const browser = new Browser(server)

    await browser.request({ method: 'POST', url: '/api/auth/sign-up', body: account })
    secrets.push(account.password, browser.cookies.get('dr_session') ?? '', browser.cookies.get('dr_csrf') ?? '')
    const stored = await db
      .selectFrom('users')
      .select('password_hash')
      .where('email', '=', account.email)
      .executeTakeFirstOrThrow()
    secrets.push(stored.password_hash ?? '')

    // A sign-in that works, three that do not (the third is the limit), a request that is not valid, and a sign-out.
    const second = new Browser(server)
    await second.request({
      method: 'POST',
      url: '/api/auth/sign-in',
      body: { email: account.email, password: account.password },
    })
    secrets.push(second.cookies.get('dr_session') ?? '', second.cookies.get('dr_csrf') ?? '')
    for (const attempt of ['a-wrong-password-1b7c', 'a-wrong-password-2d8e', 'a-wrong-password-3f9a']) {
      await new Browser(server).request({
        method: 'POST',
        url: '/api/auth/sign-in',
        body: { email: account.email, password: attempt },
      })
      secrets.push(attempt)
    }
    await new Browser(server).request({
      method: 'POST',
      url: '/api/auth/sign-up',
      body: { email: 'short@harborpine.example', password: 'too-short-4c1d', name: 'Short' },
    })
    secrets.push('too-short-4c1d')
    await second.request({ method: 'POST', url: '/api/auth/sign-out' })
    // The session of a request that arrives with a cookie that is not one.
    const forged = new Browser(server)
    forged.plant('dr_session', 'a-forged-session-token-5e2f')
    await forged.request({ method: 'GET', url: '/api/me' })
    secrets.push('a-forged-session-token-5e2f')

    const log = lines.join('')
    // Not vacuous: the requests were logged, and the sign-in route is in what was logged.
    expect(log).toContain('/api/auth/sign-in')
    expect(log).toContain('/api/auth/sign-out')
    for (const secret of secrets) expect(secret).not.toBe('')
    for (const secret of secrets) expect(log, `the log holds ${secret.slice(0, 8)}…`).not.toContain(secret)
  })
})
