import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import { sessionPolicy } from '../../src/http/auth/sessions.ts'
import {
  Browser,
  newAccount,
  recordingLiveAccess,
  sessionStackFor,
  setCookiesOf,
  type Account,
  type SessionStack,
} from '../support/auth.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createTestApp, type TestApp } from '../support/test-app.ts'

// The life of a session: how it starts, what its cookies say, how it ends. The threats are the plan's: fixation and the
// flags of the cookies.

const generous = { max: 1_000, windowMs: 60_000 }
const rateLimits = { signInFailuresPerEmail: generous, signInFailuresPerAddress: generous, signUpsPerAddress: generous }
const minute = 60_000
const day = 24 * 60 * minute

let database: TestDatabase
let db: Kysely<Database>
let clock: Date
const recorder = recordingLiveAccess(async () => undefined)
let server: TestApp
let stack: SessionStack
let account: Account
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  clock = new Date()
  stack = sessionStackFor(db, { now: () => clock })
  server = createTestApp(db, stack.withDevelopmentHeader, undefined, undefined, recorder.liveAccess, undefined, {
    session: stack,
    rateLimits,
  })
  account = newAccount()
  await new Browser(server).request({ method: 'POST', url: '/api/auth/sign-up', body: account })
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

const signIn = (browser: Browser) =>
  browser.request({
    method: 'POST',
    url: '/api/auth/sign-in',
    body: { email: account.email, password: account.password },
  })
const me = (browser: Browser) => browser.request({ method: 'GET', url: '/api/me' })
/** The id of the session a browser holds: the one the collaboration server knows it by. */
const sessionIdOf = async (browser: Browser): Promise<string> => {
  const session = await stack.sessions.resolve(browser.cookies.get('dr_session') ?? '')
  if (session === null) throw new Error('The browser has no session')
  return session.id
}
const signedInBrowser = async () => {
  const browser = new Browser(server)
  await signIn(browser)
  return browser
}

describe('session fixation', () => {
  it('does not sign in the session id that was planted in the browser before: a cookie the server never issued is never taken', async () => {
    const victim = new Browser(server)
    victim.plant('dr_session', 'a-session-id-the-attacker-chose')

    await signIn(victim)

    expect(victim.cookies.get('dr_session')).not.toBe('a-session-id-the-attacker-chose')
    const attacker = new Browser(server)
    attacker.plant('dr_session', 'a-session-id-the-attacker-chose')
    expect((await me(attacker)).statusCode).toBe(401)
  })

  it('ends the session the browser had when it signs in again, so the old cookie is worth nothing', async () => {
    const browser = await signedInBrowser()
    const before = browser.cookies.get('dr_session')

    await signIn(browser)

    expect(browser.cookies.get('dr_session')).not.toBe(before)
    const stale = new Browser(server)
    stale.plant('dr_session', before ?? '')
    expect((await me(stale)).statusCode).toBe(401)
    expect((await me(browser)).statusCode).toBe(200)
  })

  it('does the same for signing up, which also starts a session', async () => {
    const browser = await signedInBrowser()
    const before = browser.cookies.get('dr_session') ?? ''

    await browser.request({ method: 'POST', url: '/api/auth/sign-up', body: newAccount() })

    const stale = new Browser(server)
    stale.plant('dr_session', before)
    expect((await me(stale)).statusCode).toBe(401)
  })

  it('closes the connections of the session it replaced, and of no other', async () => {
    const browser = await signedInBrowser()
    const before = await sessionIdOf(browser)
    recorder.sessionsEnded.length = 0

    await signIn(browser)

    expect(recorder.sessionsEnded).toEqual([before])
  })

  it('ends the session of another person that was in the browser, when someone else signs in on the same browser', async () => {
    const browser = await signedInBrowser()
    const other = newAccount()
    const before = browser.cookies.get('dr_session') ?? ''
    await new Browser(server).request({ method: 'POST', url: '/api/auth/sign-up', body: other })

    await browser.request({
      method: 'POST',
      url: '/api/auth/sign-in',
      body: { email: other.email, password: other.password },
    })

    const stale = new Browser(server)
    stale.plant('dr_session', before)
    expect((await me(stale)).statusCode).toBe(401)
  })
})

describe('the cookies a session sets', () => {
  it('are HttpOnly for the session and readable for the CSRF token, both SameSite=Lax on the whole site', async () => {
    const response = await signIn(new Browser(server))

    const { dr_session: session, dr_csrf: csrf } = setCookiesOf(response)
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' })
    expect(csrf).toMatchObject({ httpOnly: false, sameSite: 'Lax', path: '/' })
  })

  it('end with the absolute lifetime of the session, however long it is idle', async () => {
    const response = await signIn(new Browser(server))

    const { dr_session: session } = setCookiesOf(response)
    expect(session?.expires?.getTime()).toBe(Math.floor((clock.getTime() + sessionPolicy.lifetimeMs) / 1000) * 1000)
  })

  it('are not Secure while the server is plain HTTP, which never sends back a Secure cookie', async () => {
    const response = await signIn(new Browser(server))

    expect(Object.values(setCookiesOf(response)).map(({ secure }) => secure)).toEqual([false, false, false])
  })

  describe('in production', () => {
    let production: TestApp
    const { names } = sessionStackFor(db, { secure: true })
    beforeAll(() => {
      const stack = sessionStackFor(db, { secure: true })
      production = createTestApp(db, stack.provider, undefined, undefined, undefined, undefined, {
        session: stack,
        rateLimits,
      })
    })
    afterAll(() => production.app.close())

    it('are Secure, as well as HttpOnly and SameSite=Lax', async () => {
      const response = await new Browser(production, names).request({
        method: 'POST',
        url: '/api/auth/sign-in',
        body: { email: account.email, password: account.password },
      })

      const cookies = setCookiesOf(response)
      expect(cookies['__Host-dr_session']).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax' })
      expect(cookies['__Host-dr_csrf']).toMatchObject({ secure: true, httpOnly: false, sameSite: 'Lax' })
      expect(cookies['__Host-dr_device']).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Strict' })
    })

    it('are cleared with the same attributes at sign-out, which a browser needs to remove them', async () => {
      const browser = new Browser(production, names)
      await browser.request({
        method: 'POST',
        url: '/api/auth/sign-in',
        body: { email: account.email, password: account.password },
      })

      const response = await browser.request({ method: 'POST', url: '/api/auth/sign-out' })

      const cookies = setCookiesOf(response)
      expect(cookies['__Host-dr_session']).toMatchObject({
        value: '',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
      })
      expect(cookies['__Host-dr_csrf']).toMatchObject({ value: '', secure: true, sameSite: 'Lax', path: '/' })
    })
  })
})

describe('signing out', () => {
  it('answers 204, clears both cookies and leaves the cookie it had worth nothing', async () => {
    const browser = await signedInBrowser()
    const token = browser.cookies.get('dr_session') ?? ''

    const response = await browser.request({ method: 'POST', url: '/api/auth/sign-out' })

    expect(response.statusCode).toBe(204)
    expect(Object.keys(setCookiesOf(response)).sort()).toEqual(['dr_csrf', 'dr_session'])
    // The device cookie is not the session: it says this browser has signed in before, and outlives signing out (ADR 0004).
    expect([...browser.cookies.keys()]).toEqual(['dr_device'])
    const kept = new Browser(server)
    kept.plant('dr_session', token)
    expect((await me(kept)).statusCode).toBe(401)
  })

  it('deletes the session from the database', async () => {
    const browser = await signedInBrowser()
    const id = await sessionIdOf(browser)

    await browser.request({ method: 'POST', url: '/api/auth/sign-out' })

    expect(await db.selectFrom('sessions').select('id').where('id', '=', id).execute()).toEqual([])
  })

  it('closes the connections of the session, once it is gone from the database and not before', async () => {
    const browser = await signedInBrowser()
    const id = await sessionIdOf(browser)
    let stillThereWhenClosed: boolean | undefined
    const ordered = recordingLiveAccess(async (ended) => {
      stillThereWhenClosed = (await db.selectFrom('sessions').select('id').where('id', '=', ended).execute()).length > 0
    })
    const stack = sessionStackFor(db)
    const app = createTestApp(db, stack.withDevelopmentHeader, undefined, undefined, ordered.liveAccess, undefined, {
      session: stack,
      rateLimits,
    })
    const other = new Browser(app)
    other.plant('dr_session', browser.cookies.get('dr_session') ?? '')
    other.plant('dr_csrf', browser.cookies.get('dr_csrf') ?? '')

    await other.request({ method: 'POST', url: '/api/auth/sign-out' })
    await app.app.close()

    expect(ordered.sessionsEnded).toEqual([id])
    expect(stillThereWhenClosed).toBe(false)
  })

  it('needs a session: without one it is a 401', async () => {
    const response = await new Browser(server).request({ method: 'POST', url: '/api/auth/sign-out' })

    expect(response).toMatchObject({ statusCode: 401, body: { code: 'unauthenticated' } })
  })

  it('needs the CSRF token: without it the session stays', async () => {
    const browser = await signedInBrowser()

    const response = await browser.request({ method: 'POST', url: '/api/auth/sign-out', sendCsrf: false })

    expect(response).toMatchObject({ statusCode: 403, body: { code: 'csrf' } })
    expect((await me(browser)).statusCode).toBe(200)
  })

  it('does not end the session of another device of the same person', async () => {
    const [laptop, phone] = [await signedInBrowser(), await signedInBrowser()]

    await laptop.request({ method: 'POST', url: '/api/auth/sign-out' })

    expect((await me(phone)).statusCode).toBe(200)
  })
})

describe('a cookie that is not a session', () => {
  it.each([
    ['one the server never issued', async () => 'a-token-that-was-never-issued'],
    [
      'one of a session that was signed out',
      async () => {
        const browser = await signedInBrowser()
        const token = browser.cookies.get('dr_session') ?? ''
        await browser.request({ method: 'POST', url: '/api/auth/sign-out' })
        return token
      },
    ],
  ])('is refused when it is %s', async (_case, tokenOf) => {
    const browser = new Browser(server)
    browser.plant('dr_session', await tokenOf())

    expect(await me(browser)).toMatchObject({ statusCode: 401, body: { code: 'unauthenticated' } })
  })
})

describe('a session that has gone unused or lasted too long', () => {
  it('is refused once the idle window has passed, and kept alive by use before it', async () => {
    const browser = await signedInBrowser()
    const start = clock
    try {
      clock = new Date(start.getTime() + sessionPolicy.idleMs - minute)
      expect((await me(browser)).statusCode).toBe(200)

      clock = new Date(start.getTime() + 2 * sessionPolicy.idleMs - 2 * minute)
      expect((await me(browser)).statusCode).toBe(200)

      clock = new Date(start.getTime() + 3 * sessionPolicy.idleMs)
      expect((await me(browser)).statusCode).toBe(401)
    } finally {
      clock = start
    }
  })

  it('is refused after its absolute lifetime, however much it was used', async () => {
    const browser = await signedInBrowser()
    const start = clock
    try {
      for (let elapsed = 5 * day; elapsed < sessionPolicy.lifetimeMs; elapsed += 5 * day) {
        clock = new Date(start.getTime() + elapsed)
        expect((await me(browser)).statusCode).toBe(200)
      }
      clock = new Date(start.getTime() + sessionPolicy.lifetimeMs + minute)
      expect((await me(browser)).statusCode).toBe(401)
    } finally {
      clock = start
    }
  })

  it('does not write that it was used for the second request inside the interval', async () => {
    const browser = await signedInBrowser()
    const start = clock
    const id = await sessionIdOf(browser)
    const lastSeen = async () =>
      (await db.selectFrom('sessions').select('last_seen_at').where('id', '=', id).executeTakeFirstOrThrow())
        .last_seen_at
    try {
      clock = new Date(start.getTime() + sessionPolicy.touchIntervalMs + minute)
      await me(browser)
      const written = await lastSeen()
      clock = new Date(start.getTime() + sessionPolicy.touchIntervalMs + 2 * minute)
      await me(browser)
      await me(browser)

      expect(written.getTime()).toBe(start.getTime() + sessionPolicy.touchIntervalMs + minute)
      expect(await lastSeen()).toEqual(written)
    } finally {
      clock = start
    }
  })
})
