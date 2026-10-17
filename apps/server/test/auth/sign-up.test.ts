import type { Schema } from '@draftroom/contract'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import { Browser, goodPassword, newAccount, sessionStackFor, setCookiesOf } from '../support/auth.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createTestApp, type TestApp } from '../support/test-app.ts'
import { bodyAs } from '../support/api.ts'
import { createDocument, createPendingPerson, createPerson, createWorkspace, grant, join } from '../support/world.ts'

// Signing up (`signUp`): a new account, or the claim of the row a person was invited under.

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  const stack = sessionStackFor(db)
  server = createTestApp(db, stack.withDevelopmentHeader, undefined, undefined, undefined, undefined, {
    session: stack,
    // Many accounts are made by one address in these tests.
    rateLimits: {
      signInFailuresPerEmail: { max: 100, windowMs: 60_000 },
      signInFailuresPerAddress: { max: 100, windowMs: 60_000 },
      signUpsPerAddress: { max: 100, windowMs: 60_000 },
    },
  })
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

const signUp = (browser: Browser, account = newAccount()) =>
  browser.request({ method: 'POST', url: '/api/auth/sign-up', body: account })

describe('signing up with an address nobody has used', () => {
  it('creates the account, starts the session and answers with the person', async () => {
    const browser = new Browser(server)
    const account = newAccount()

    const response = await signUp(browser, account)

    expect(response.statusCode).toBe(201)
    expect(bodyAs<Schema<'User'>>(response)).toEqual({
      id: expect.any(String),
      email: account.email,
      name: account.name,
    })
    expect(Object.keys(setCookiesOf(response)).sort()).toEqual(['dr_csrf', 'dr_session'])
  })

  it('leaves the person signed in: the session cookie is who they are', async () => {
    const browser = new Browser(server)
    const account = newAccount({ name: 'Eli Vega' })
    await signUp(browser, account)

    const me = await browser.request({ method: 'GET', url: '/api/me' })

    expect(me.body).toMatchObject({ email: account.email, name: 'Eli Vega' })
  })

  it('keeps the password as an Argon2id hash and never as it was typed', async () => {
    const account = newAccount()
    await signUp(new Browser(server), account)

    const row = await db.selectFrom('users').selectAll().where('email', '=', account.email).executeTakeFirstOrThrow()

    expect(row.password_hash?.startsWith('$argon2id$')).toBe(true)
    expect(JSON.stringify(row)).not.toContain(account.password)
    expect(row.signed_up_at).toBeInstanceOf(Date)
  })

  it('puts the person in no workspace, because the contract gives an account nothing else to join', async () => {
    const browser = new Browser(server)
    await signUp(browser)

    const workspaces = await browser.request({ method: 'GET', url: '/api/workspaces' })

    expect(workspaces.body).toEqual({ items: [] })
  })

  it('takes twelve emoji as a password of twelve, because the limit counts code points', async () => {
    const response = await signUp(new Browser(server), newAccount({ password: '🔑'.repeat(12) }))

    expect(response.statusCode).toBe(201)
  })

  it('is refused, with the fields at fault, for a password of eleven', async () => {
    const response = await signUp(new Browser(server), newAccount({ password: 'a'.repeat(11) }))

    expect(response).toMatchObject({
      statusCode: 400,
      body: { code: 'validation-failed', errors: [{ pointer: '/password', code: expect.any(String) }] },
    })
  })

  it('is refused as too large for a password over 128 code points, and starts no session', async () => {
    const browser = new Browser(server)

    const response = await signUp(browser, newAccount({ password: 'a'.repeat(129) }))

    expect(response.statusCode).toBe(413)
    expect(browser.cookies.size).toBe(0)
  })
})

describe('signing up with an address that has an account', () => {
  it('is a conflict, starts no session, and leaves the account and its password as they were', async () => {
    const account = newAccount()
    await signUp(new Browser(server), account)
    const intruder = new Browser(server)

    const response = await signUp(intruder, { ...account, password: 'another password entirely', name: 'Someone Else' })

    expect(response).toMatchObject({ statusCode: 409, body: { code: 'conflict' } })
    expect(intruder.cookies.size).toBe(0)
    const row = await db
      .selectFrom('users')
      .select(['name'])
      .where('email', '=', account.email)
      .executeTakeFirstOrThrow()
    expect(row.name).toBe(account.name)
    const signIn = await new Browser(server).request({
      method: 'POST',
      url: '/api/auth/sign-in',
      body: { email: account.email, password: account.password },
    })
    expect(signIn.statusCode).toBe(200)
  })

  it('does not tell one case of an address from another', async () => {
    const account = newAccount({ email: 'Marta.Case@harborpine.example' })
    await signUp(new Browser(server), account)

    const response = await signUp(new Browser(server), { ...account, email: 'marta.case@HARBORPINE.example' })

    expect(response.statusCode).toBe(409)
  })

  it('lets only one of two sign-ups for the same address, made at once, win', async () => {
    const account = newAccount()

    const answers = await Promise.all([signUp(new Browser(server), account), signUp(new Browser(server), account)])

    expect(answers.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409])
  })
})

describe('signing up with an address that is taken between the check and the write', () => {
  it('is a conflict and not a failure of the server, whoever wrote first', async () => {
    const account = newAccount()
    let answer: Promise<Awaited<ReturnType<typeof signUp>>> | undefined
    // Another sign-up has written the address and not committed yet: this one does not see the row, goes on to write its own, and
    // waits for the first at the unique index. When the first commits, the write is refused and the answer is the contract's.
    await db.transaction().execute(async (transaction) => {
      await transaction
        .insertInto('users')
        .values({ email: account.email, name: 'First Of Two', signed_up_at: new Date() })
        .execute()
      answer = signUp(new Browser(server), account)
      await new Promise((resolve) => setTimeout(resolve, 400))
    })

    expect((await answer)?.statusCode).toBe(409)
  })
})

describe('signing up with an address that was invited', () => {
  it('claims the invitation: same person, now active in the workspace, with the grants given to the address', async () => {
    const workspaceId = await createWorkspace(db)
    const owner = await createPerson(db, 'Marta Ruiz')
    await join(db, workspaceId, owner, 'owner')
    const documentId = await createDocument(db, { workspaceId, creator: owner })
    const invited = await createPendingPerson(db)
    await join(db, workspaceId, invited, 'member')
    await grant(db, { workspaceId, documentId, person: { ...invited, name: 'unused' }, role: 'editor' })
    const browser = new Browser(server)

    const response = await signUp(browser, newAccount({ email: invited.email.toUpperCase(), name: 'Tom Weller' }))

    // The same row: the person that was invited, not a second one.
    expect(bodyAs<Schema<'User'>>(response)).toMatchObject({ id: invited.id, name: 'Tom Weller' })
    expect(await db.selectFrom('users').select('id').where('id', '=', invited.id).execute()).toHaveLength(1)
    const workspaces = await browser.request({ method: 'GET', url: '/api/workspaces' })
    expect(workspaces.body).toMatchObject({ items: [{ id: workspaceId }] })
    const document = await browser.request({ method: 'GET', url: `/api/documents/${documentId}` })
    expect(document).toMatchObject({ statusCode: 200, body: { id: documentId, role: 'editor' } })
  })

  it('does not give another person’s invitation to an address that merely looks like it', async () => {
    const workspaceId = await createWorkspace(db)
    const invited = await createPendingPerson(db)
    await join(db, workspaceId, invited, 'member')
    const browser = new Browser(server)

    await signUp(browser, newAccount({ email: `x${invited.email}` }))

    expect((await browser.request({ method: 'GET', url: '/api/workspaces' })).body).toEqual({ items: [] })
  })
})

describe('what the password may be', () => {
  it('is the same password whichever way its letters are written', async () => {
    const account = newAccount({ password: 'café au lait, always' })
    await signUp(new Browser(server), account)

    const response = await new Browser(server).request({
      method: 'POST',
      url: '/api/auth/sign-in',
      body: { email: account.email, password: 'café au lait, always' },
    })

    expect(response.statusCode).toBe(200)
  })

  it('has no rules of composition: a long phrase of one letter is as good as any', async () => {
    const response = await signUp(new Browser(server), newAccount({ password: goodPassword.replaceAll(/./g, 'a') }))

    expect(response.statusCode).toBe(201)
  })
})
