import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import type { RateLimits } from '../../src/http/auth/rateLimit.ts'
import { Browser, newAccount, sessionStackFor, setCookiesOf, type Account } from '../support/auth.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createTestApp, type TestApp } from '../support/test-app.ts'

// The lockout that anybody can cause: ten wrong passwords for an address, from anywhere, shut its owner out for a quarter
// of an hour. A browser the owner has already signed in with carries a device cookie and is counted on its own (ADR 0004).

const window = 60_000
const generous = { max: 1_000, windowMs: window }
const limits: RateLimits = {
  signInFailuresPerEmail: { max: 3, windowMs: window },
  signInFailuresPerAddress: generous,
  signUpsPerAddress: generous,
}
const wrong = 'not the password at all'

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
let owner: Account
let ownersBrowser: Browser

beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  const stack = sessionStackFor(db)
  server = createTestApp(db, stack.provider, undefined, undefined, undefined, undefined, {
    session: stack,
    rateLimits: limits,
  })
  owner = newAccount()
  ownersBrowser = new Browser(server)
  await ownersBrowser.request({ method: 'POST', url: '/api/auth/sign-up', body: owner })
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

const signIn = (browser: Browser, email: string, password: string) =>
  browser.request({ method: 'POST', url: '/api/auth/sign-in', body: { email, password } })

/** A browser that has signed in to `account` before: what the owner's is, with its device cookie and nothing else. */
async function knownBrowser(account: Account): Promise<Browser> {
  const browser = new Browser(server)
  await signIn(browser, account.email, account.password)
  browser.cookies.delete('dr_session')
  browser.cookies.delete('dr_csrf')
  return browser
}

/** Somebody who guesses at the account from elsewhere, until the address of email is shut. */
async function lockOut(email: string): Promise<void> {
  const attacker = new Browser(server)
  for (let attempt = 0; attempt < limits.signInFailuresPerEmail.max; attempt++) await signIn(attacker, email, wrong)
  expect((await signIn(attacker, email, wrong)).statusCode).toBe(429)
}

describe('the device cookie', () => {
  it('is left by a sign-up and by a sign-in that was right, and by nothing else', async () => {
    const account = newAccount()
    const first = new Browser(server)
    const signedUp = await first.request({ method: 'POST', url: '/api/auth/sign-up', body: account })
    const second = new Browser(server)

    const rejected = await signIn(second, account.email, wrong)
    const accepted = await signIn(second, account.email, account.password)

    expect(Object.keys(setCookiesOf(signedUp))).toContain('dr_device')
    expect(Object.keys(setCookiesOf(rejected))).toEqual([])
    expect(setCookiesOf(accepted)['dr_device']).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' })
  })

  it('stays the same value for the same browser, so a browser is one device however often it signs in', async () => {
    const account = newAccount()
    const browser = new Browser(server)
    await browser.request({ method: 'POST', url: '/api/auth/sign-up', body: account })
    const before = browser.cookies.get('dr_device')

    await signIn(browser, account.email, account.password)

    expect(browser.cookies.get('dr_device')).toBe(before)
  })

  it('is different for two browsers of the same person', async () => {
    const other = await knownBrowser(owner)

    expect(other.cookies.get('dr_device')).not.toBe(ownersBrowser.cookies.get('dr_device'))
  })
})

describe('an address of email that somebody else has shut', () => {
  it('lets in the browser the owner has signed in with, and not one that is unknown', async () => {
    const account = newAccount()
    const browser = new Browser(server)
    await browser.request({ method: 'POST', url: '/api/auth/sign-up', body: account })
    browser.cookies.delete('dr_session')
    browser.cookies.delete('dr_csrf')
    await lockOut(account.email)

    const known = await signIn(browser, account.email, account.password)
    const unknown = await signIn(new Browser(server), account.email, account.password)

    expect(known.statusCode).toBe(200)
    expect(unknown.statusCode).toBe(429)
  })

  it('does not let in a browser whose cookie was made for another address', async () => {
    const mine = newAccount()
    const theirs = newAccount()
    const browser = new Browser(server)
    await browser.request({ method: 'POST', url: '/api/auth/sign-up', body: mine })
    await new Browser(server).request({ method: 'POST', url: '/api/auth/sign-up', body: theirs })
    await lockOut(theirs.email)

    const response = await signIn(browser, theirs.email, theirs.password)

    expect(response.statusCode).toBe(429)
  })

  it.each([
    ['a value nobody made', 'AAAAAAAAAAAAAAAAAAAAAA.not-a-signature'],
    ['a value with no signature', 'AAAAAAAAAAAAAAAAAAAAAA'],
    ['an empty value', ''],
  ])('does not let in a browser with %s as its device cookie', async (_name, forged) => {
    const account = newAccount()
    await new Browser(server).request({ method: 'POST', url: '/api/auth/sign-up', body: account })
    await lockOut(account.email)
    const browser = new Browser(server)
    browser.plant('dr_device', forged)

    const response = await signIn(browser, account.email, account.password)

    expect(response.statusCode).toBe(429)
  })

  it('does not let in a cookie of the owner’s with the signature of another', async () => {
    const account = newAccount()
    const real = await (async () => {
      const browser = new Browser(server)
      await browser.request({ method: 'POST', url: '/api/auth/sign-up', body: account })
      return browser.cookies.get('dr_device') ?? ''
    })()
    await lockOut(account.email)
    const [, signature = ''] = real.split('.')
    const browser = new Browser(server)
    browser.plant('dr_device', `a-device-id-i-chose.${signature}`)

    const response = await signIn(browser, account.email, account.password)

    expect(response.statusCode).toBe(429)
  })
})

describe('the allowance of a browser that is known', () => {
  it('is its own: the wrong passwords of a stranger do not use it up', async () => {
    const account = newAccount()
    const browser = await (async () => {
      const first = new Browser(server)
      await first.request({ method: 'POST', url: '/api/auth/sign-up', body: account })
      return first
    })()
    await lockOut(account.email)

    const answers = []
    for (let attempt = 0; attempt < 4; attempt++) answers.push(await signIn(browser, account.email, wrong))

    expect(answers.map(({ statusCode }) => statusCode)).toEqual([401, 401, 401, 429])
  })

  it('is bounded like any other, so a stolen cookie is worth a few guesses and not an unlimited number', async () => {
    const account = newAccount()
    const first = new Browser(server)
    await first.request({ method: 'POST', url: '/api/auth/sign-up', body: account })
    const thief = new Browser(server)
    thief.plant('dr_device', first.cookies.get('dr_device') ?? '')

    const answers = []
    for (let attempt = 0; attempt < 5; attempt++) answers.push(await signIn(thief, account.email, wrong))
    const rightPasswordAfterwards = await signIn(thief, account.email, account.password)

    expect(answers.map(({ statusCode }) => statusCode)).toEqual([401, 401, 401, 429, 429])
    expect(rightPasswordAfterwards.statusCode).toBe(429)
  })

  it('holds against guesses that arrive together: exactly the limit gets an answer, the rest are 429', async () => {
    const account = newAccount()
    const first = new Browser(server)
    await first.request({ method: 'POST', url: '/api/auth/sign-up', body: account })
    const thief = new Browser(server)
    thief.plant('dr_device', first.cookies.get('dr_device') ?? '')

    const answers = await Promise.all(Array.from({ length: 40 }, () => signIn(thief, account.email, wrong)))

    const codes = answers.map(({ statusCode }) => statusCode)
    expect({
      answered: codes.filter((code) => code === 401).length,
      refused: codes.filter((code) => code === 429).length,
    }).toEqual({ answered: 3, refused: 37 })
  })
})
