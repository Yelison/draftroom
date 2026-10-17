import type { Kysely } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import { createPasswords, type Passwords } from '../../src/http/auth/passwords.ts'
import type { RateLimits } from '../../src/http/auth/rateLimit.ts'
import { Browser, newAccount, sessionStackFor, type Account } from '../support/auth.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createTestApp, type TestApp } from '../support/test-app.ts'

// The limit on attempts (threat table: brute force). Small figures, so that a test reaches them: the decided ones are in
// `defaultRateLimits`. Each test builds its own app, because the counts live in the memory of the app.

const window = 60_000
const small: RateLimits = {
  signInFailuresPerEmail: { max: 3, windowMs: window },
  signInFailuresPerAddress: { max: 6, windowMs: window },
  signUpsPerAddress: { max: 2, windowMs: window },
}

let database: TestDatabase
let db: Kysely<Database>
let account: Account
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  account = newAccount({ email: 'Marta.Ruiz@harborpine.example' })
  const stack = sessionStackFor(db)
  const setUp = createTestApp(db, stack.provider, undefined, undefined, undefined, undefined, {
    session: stack,
    rateLimits: { ...small, signUpsPerAddress: { max: 100, windowMs: window } },
  })
  await new Browser(setUp).request({ method: 'POST', url: '/api/auth/sign-up', body: account })
  await setUp.app.close()
})
afterAll(async () => {
  await database.drop()
})

const real = createPasswords()
let apps: TestApp[] = []
let checked: (string | null)[] = []
const watched: Passwords = {
  hash: real.hash,
  matches: (password, stored) => {
    checked.push(stored)
    return real.matches(password, stored)
  },
}
afterEach(async () => {
  await Promise.all(apps.map(({ app }) => app.close()))
  apps = []
  checked = []
})

function appWith(rateLimits: RateLimits = small): TestApp {
  const stack = sessionStackFor(db)
  const server = createTestApp(db, stack.provider, undefined, undefined, undefined, undefined, {
    session: stack,
    passwords: watched,
    rateLimits,
  })
  apps.push(server)
  return server
}

const signIn = (server: TestApp, email: string, password: string, remoteAddress?: string) =>
  server.request({
    method: 'POST',
    url: '/api/auth/sign-in',
    payload: { email, password },
    ...(remoteAddress === undefined ? {} : { remoteAddress }),
  })
const wrong = 'not the password at all'

describe('wrong passwords for one address of email', () => {
  it('are answered as usual up to the limit, and then with 429 and the time to wait', async () => {
    const server = appWith()

    const answers = []
    for (let attempt = 0; attempt < 4; attempt++) answers.push(await signIn(server, account.email, wrong))

    expect(answers.map(({ statusCode }) => statusCode)).toEqual([401, 401, 401, 429])
    expect(answers[3]?.body).toMatchObject({ status: 429, code: 'rate-limited' })
    const retryAfter = Number(answers[3]?.headers['retry-after'])
    expect(Number.isInteger(retryAfter)).toBe(true)
    expect(retryAfter).toBeGreaterThanOrEqual(1)
    expect(retryAfter).toBeLessThanOrEqual(window / 1000)
  })

  it('shut out the right password too, which is not even checked: the limit is no oracle for a guess', async () => {
    const server = appWith()
    for (let attempt = 0; attempt < 3; attempt++) await signIn(server, account.email, wrong)
    checked.length = 0

    const withTheRightOne = await signIn(server, account.email, account.password)

    expect(withTheRightOne.statusCode).toBe(429)
    expect(withTheRightOne.headers['set-cookie']).toBeUndefined()
    expect(checked).toEqual([])
  })

  it('count the address of email as one whatever its case or the space around it', async () => {
    const server = appWith()

    const answers = []
    for (const email of [
      account.email,
      account.email.toUpperCase(),
      ` ${account.email.toLowerCase()} `.trim(),
      account.email,
    ]) {
      answers.push(await signIn(server, email, wrong))
    }

    expect(answers.map(({ statusCode }) => statusCode)).toEqual([401, 401, 401, 429])
  })

  it('stop counting once the window has passed', async () => {
    const server = appWith({ ...small, signInFailuresPerEmail: { max: 2, windowMs: 400 } })
    await signIn(server, account.email, wrong)
    await signIn(server, account.email, wrong)
    expect((await signIn(server, account.email, wrong)).statusCode).toBe(429)

    await new Promise((resolve) => setTimeout(resolve, 600))

    expect((await signIn(server, account.email, account.password)).statusCode).toBe(200)
  })
})

describe('what counts', () => {
  it('is a failure and nothing else: signing in right does not use up what is left for a person who forgets', async () => {
    const server = appWith()
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await signIn(server, account.email, account.password)).statusCode).toBe(200)
    }

    const answers = []
    for (let attempt = 0; attempt < 4; attempt++) answers.push(await signIn(server, account.email, wrong))

    expect(answers.map(({ statusCode }) => statusCode)).toEqual([401, 401, 401, 429])
  })

  it('is an address with no account as much as one that has, so the limit says nothing about who has one', async () => {
    const server = appWith()
    const attempt = (email: string) => signIn(server, email, wrong)

    const known = [
      await attempt(account.email),
      await attempt(account.email),
      await attempt(account.email),
      await attempt(account.email),
    ]
    const unknown = [
      await attempt('nobody@harborpine.example'),
      await attempt('nobody@harborpine.example'),
      await attempt('nobody@harborpine.example'),
      await attempt('nobody@harborpine.example'),
    ]

    expect(unknown.map(({ statusCode }) => statusCode)).toEqual(known.map(({ statusCode }) => statusCode))
    expect(unknown[3]?.body).toEqual(known[3]?.body)
    expect(unknown[3]?.headers['retry-after']).toBeDefined()
  })

  it('leaves another account alone: one person’s wrong passwords do not shut out the rest of the address', async () => {
    const server = appWith()
    for (let attempt = 0; attempt < 3; attempt++) await signIn(server, 'someone-else@harborpine.example', wrong)

    expect((await signIn(server, account.email, account.password)).statusCode).toBe(200)
  })
})

describe('wrong passwords from one network address', () => {
  it('shut out every account from it once there are too many, whichever accounts they name', async () => {
    const server = appWith()
    for (let attempt = 0; attempt < 6; attempt++) {
      await signIn(server, `guess-${attempt}@harborpine.example`, wrong, '203.0.113.7')
    }

    const fromThere = await signIn(server, account.email, account.password, '203.0.113.7')
    const fromElsewhere = await signIn(server, account.email, account.password, '203.0.113.8')

    expect([fromThere.statusCode, fromElsewhere.statusCode]).toEqual([429, 200])
  })
})

describe('accounts created from one network address', () => {
  it('are limited, and each one counts whatever came of it', async () => {
    const server = appWith()
    const signUp = (remoteAddress: string, body = newAccount()) =>
      server.request({ method: 'POST', url: '/api/auth/sign-up', payload: body, remoteAddress })

    const answers = [
      await signUp('203.0.113.7'),
      await signUp('203.0.113.7', { ...account }),
      await signUp('203.0.113.7'),
    ]
    const elsewhere = await signUp('203.0.113.8')

    // The second is a conflict, and it used up an attempt all the same.
    expect(answers.map(({ statusCode }) => statusCode)).toEqual([201, 409, 429])
    expect(answers[2]?.headers['retry-after']).toBeDefined()
    expect(elsewhere.statusCode).toBe(201)
  })
})

describe('attempts that arrive at the same time', () => {
  // The limit has to hold for a hundred requests sent together as it does for a hundred sent one after another: what each
  // one costs the server (the query and Argon2id) is far longer than it takes all of them to arrive.
  const generousRule = { max: 1_000, windowMs: window }
  const sent = (server: TestApp, count: number, attempt: (index: number) => ReturnType<typeof signIn>) =>
    Promise.all(Array.from({ length: count }, (_, index) => attempt(index)))
  const statuses = (answers: Awaited<ReturnType<typeof sent>>) => answers.map(({ statusCode }) => statusCode)
  const howMany = (list: readonly number[], status: number) => list.filter((code) => code === status).length

  it('are held to the limit of an address of email: ten wrong passwords are checked, and the other twenty are refused', async () => {
    const server = appWith({
      signInFailuresPerEmail: { max: 10, windowMs: window },
      signInFailuresPerAddress: generousRule,
      signUpsPerAddress: generousRule,
    })

    const answers = statuses(await sent(server, 30, (index) => signIn(server, account.email, `${wrong} ${index}`)))

    expect([howMany(answers, 401), howMany(answers, 429)]).toEqual([10, 20])
    expect(checked).toHaveLength(10)
  })

  it('do not let the right password in because it was sent inside the burst, after the tenth failure', async () => {
    const server = appWith({
      signInFailuresPerEmail: { max: 10, windowMs: window },
      signInFailuresPerAddress: generousRule,
      signUpsPerAddress: generousRule,
    })

    const answers = await sent(server, 20, (index) =>
      signIn(server, account.email, index === 15 ? account.password : `${wrong} ${index}`),
    )

    expect(answers[15]?.statusCode).toBe(429)
    expect(statuses(answers)).not.toContain(200)
    expect(answers[15]?.headers['set-cookie']).toBeUndefined()
  })

  it('are held to the limit of a network address, whichever accounts they name', async () => {
    const server = appWith({
      signInFailuresPerEmail: generousRule,
      signInFailuresPerAddress: { max: 6, windowMs: window },
      signUpsPerAddress: generousRule,
    })

    const answers = statuses(
      await sent(server, 20, (index) => signIn(server, `guess-${index}@harborpine.example`, wrong, '203.0.113.9')),
    )

    expect([howMany(answers, 401), howMany(answers, 429)]).toEqual([6, 14])
  })

  it('are held to the limit of accounts created from a network address', async () => {
    const server = appWith({
      signInFailuresPerEmail: generousRule,
      signInFailuresPerAddress: generousRule,
      signUpsPerAddress: { max: 2, windowMs: window },
    })

    const answers = statuses(
      await Promise.all(
        Array.from({ length: 6 }, () =>
          server.request({
            method: 'POST',
            url: '/api/auth/sign-up',
            payload: newAccount(),
            remoteAddress: '203.0.113.10',
          }),
        ),
      ),
    )

    expect([howMany(answers, 201), howMany(answers, 429)]).toEqual([2, 4])
  })

  it('give back what they held once they are answered, so signing in right in a burst leaves the allowance untouched', async () => {
    const server = appWith()

    const right = statuses(await sent(server, 3, () => signIn(server, account.email, account.password)))
    const after = []
    for (let attempt = 0; attempt < 4; attempt++) after.push((await signIn(server, account.email, wrong)).statusCode)

    expect(right).toEqual([200, 200, 200])
    expect(after).toEqual([401, 401, 401, 429])
  })
})
