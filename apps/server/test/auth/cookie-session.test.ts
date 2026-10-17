import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import type { AuthRequest } from '../../src/http/auth/auth-provider.ts'
import { createCookieSessions, withDevelopmentIdentity } from '../../src/http/auth/cookie-session.ts'
import { cookieNamesFor } from '../../src/http/auth/cookies.ts'
import { createCsrf } from '../../src/http/auth/csrf.ts'
import { createDevIdentity, devUserHeader } from '../../src/http/auth/devIdentity.ts'
import { createSessions, type Sessions } from '../../src/http/auth/sessions.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createPerson, type Person } from '../support/world.ts'

// The provider that reads who is calling from the session cookie, and the order of its two checks (docs/api/README.md):
// the session first, which answers 401, then the CSRF token, which answers 403.

const csrf = createCsrf('a-secret-that-is-long-enough-for-an-hmac')

let database: TestDatabase
let db: Kysely<Database>
let sessions: Sessions
let marta: Person
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  sessions = createSessions({ database: db })
  marta = await createPerson(db, 'Marta Ruiz')
})
afterAll(async () => {
  await database.drop()
})

const provider = () => createCookieSessions({ sessions, csrf, names: cookieNamesFor(false) })

/** What a browser sends: its cookies, and the header the page adds to a request that changes something. */
const requestOf = (cookies: Record<string, string>, extra: Record<string, string> = {}): AuthRequest => ({
  headers: {
    cookie: Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; '),
    ...extra,
  },
})

describe('a request with the session cookie', () => {
  it('is the person the session belongs to, with the session’s id for the collaboration server', async () => {
    const { token, id } = await sessions.start(marta.id)

    const authentication = await provider().authenticate(requestOf({ dr_session: token }), { csrf: false })

    expect(authentication).toEqual({ status: 'authenticated', principal: { userId: marta.id, sessionId: id } })
  })

  it('finds the cookie among others, in any order', async () => {
    const { token } = await sessions.start(marta.id)

    const authentication = await provider().authenticate(requestOf({ theme: 'dark', dr_session: token, lang: 'es' }), {
      csrf: false,
    })

    expect(authentication.status).toBe('authenticated')
  })

  it.each([
    ['no cookie header at all', { headers: {} }],
    ['other cookies and no session', requestOf({ theme: 'dark' })],
    ['an empty session cookie', requestOf({ dr_session: '' })],
    ['a token that was never issued', requestOf({ dr_session: 'a-token-nobody-issued' })],
  ])('is nobody with %s', async (_case, request) => {
    expect(await provider().authenticate(request, { csrf: false })).toEqual({ status: 'unauthenticated' })
  })

  it('is nobody once the session has ended', async () => {
    const { token, id } = await sessions.start(marta.id)
    await sessions.end(id)

    expect(await provider().authenticate(requestOf({ dr_session: token }), { csrf: false })).toEqual({
      status: 'unauthenticated',
    })
  })
})

describe('a request that changes something', () => {
  it('needs the CSRF token of its session, in the cookie and in the header', async () => {
    const { token } = await sessions.start(marta.id)
    const csrfToken = csrf.tokenFor(token)

    const authentication = await provider().authenticate(
      requestOf({ dr_session: token, dr_csrf: csrfToken }, { 'x-csrf-token': csrfToken }),
      { csrf: true },
    )

    expect(authentication.status).toBe('authenticated')
  })

  it.each([
    ['no header', (token: string) => requestOf({ dr_session: token, dr_csrf: csrf.tokenFor(token) })],
    ['no CSRF cookie', (token: string) => requestOf({ dr_session: token }, { 'x-csrf-token': csrf.tokenFor(token) })],
    [
      'a header that is not the cookie',
      (token: string) => requestOf({ dr_session: token, dr_csrf: csrf.tokenFor(token) }, { 'x-csrf-token': 'guess' }),
    ],
    [
      'a token that is another session’s',
      (token: string) =>
        requestOf(
          { dr_session: token, dr_csrf: csrf.tokenFor('other-session') },
          { 'x-csrf-token': csrf.tokenFor('other-session') },
        ),
    ],
  ])('is refused with %s', async (_case, build) => {
    const { token } = await sessions.start(marta.id)

    expect(await provider().authenticate(build(token), { csrf: true })).toEqual({ status: 'csrf-rejected' })
  })

  it('is asked for the session first: without one it is a 401 whatever the token says', async () => {
    const authentication = await provider().authenticate(
      requestOf({ dr_session: 'never-issued', dr_csrf: 'x' }, { 'x-csrf-token': 'not-x' }),
      { csrf: true },
    )

    expect(authentication).toEqual({ status: 'unauthenticated' })
  })

  it('is not asked for the token by a request that only reads', async () => {
    const { token } = await sessions.start(marta.id)

    expect((await provider().authenticate(requestOf({ dr_session: token }), { csrf: false })).status).toBe(
      'authenticated',
    )
  })
})

describe('the provider of development and the tests', () => {
  const combined = () => withDevelopmentIdentity(provider(), createDevIdentity(db))

  it('takes the session cookie when there is one', async () => {
    const eli = await createPerson(db, 'Eli Vega')
    const { token } = await sessions.start(marta.id)

    const authentication = await combined().authenticate(
      requestOf({ dr_session: token }, { [devUserHeader]: eli.email }),
      { csrf: false },
    )

    expect(authentication).toMatchObject({ status: 'authenticated', principal: { userId: marta.id } })
  })

  it('takes the development header when there is no session, and asks it for no CSRF token', async () => {
    const authentication = await combined().authenticate({ headers: { [devUserHeader]: marta.email } }, { csrf: true })

    expect(authentication).toEqual({ status: 'authenticated', principal: { userId: marta.id } })
  })

  it('does not let the header stand in for the CSRF token of a session that is there', async () => {
    const { token } = await sessions.start(marta.id)

    const authentication = await combined().authenticate(
      requestOf({ dr_session: token }, { [devUserHeader]: marta.email }),
      { csrf: true },
    )

    expect(authentication).toEqual({ status: 'csrf-rejected' })
  })

  it('is nobody when there is neither', async () => {
    expect(await combined().authenticate({ headers: {} }, { csrf: false })).toEqual({ status: 'unauthenticated' })
  })
})
