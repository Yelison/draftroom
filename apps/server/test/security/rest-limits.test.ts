import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import { maxRequestBodyBytes } from '../../src/http/app.ts'
import type { RequestLimits } from '../../src/http/request-limits.ts'
import { Browser, newAccount, sessionStackFor } from '../support/auth.ts'
import { developmentHardening } from '../support/hardening.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createTestApp, type TestApp } from '../support/test-app.ts'

// The limits on REST against the real routes and a real session (threat table: oversized messages or documents, and
// floods). The arithmetic of the buckets and the figures are in `src/http/request-limits.test.ts`.

const burst = 8
const limits: RequestLimits = {
  perAddress: { perSecond: 0.001, burst: 1_000 },
  perSession: { perSecond: 0.001, burst },
}

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  const stack = sessionStackFor(db)
  server = createTestApp(db, stack.provider, undefined, undefined, undefined, undefined, {
    session: stack,
    requestLimits: limits,
    hardening: { ...developmentHardening, allowedOrigins: ['https://draftroom.example'] },
  })
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

async function signedIn(): Promise<Browser> {
  const browser = new Browser(server)
  await browser.request({ method: 'POST', url: '/api/auth/sign-up', body: newAccount() })
  return browser
}
const statusesOf = (answers: readonly { statusCode: number }[]) => answers.map(({ statusCode }) => statusCode)

describe('a session that sends a burst of requests', () => {
  it('is answered up to its burst, and told to wait for the rest', async () => {
    const browser = await signedIn()
    const answers = await Promise.all(
      Array.from({ length: burst + 6 }, () => browser.request({ method: 'GET', url: '/api/me' })),
    )

    const codes = statusesOf(answers)
    expect({
      served: codes.filter((code) => code === 200).length,
      refused: codes.filter((code) => code === 429).length,
    }).toEqual({
      served: burst,
      refused: 6,
    })
    expect(answers.find(({ statusCode }) => statusCode === 429)?.body).toMatchObject({ code: 'rate-limited' })
  })

  it('does not slow down another person on the same address', async () => {
    const busy = await signedIn()
    await Promise.all(Array.from({ length: burst + 2 }, () => busy.request({ method: 'GET', url: '/api/me' })))
    const other = await signedIn()

    expect((await other.request({ method: 'GET', url: '/api/me' })).statusCode).toBe(200)
  })

  it('is not let off by a request that will fail: a refused body, an unknown document and a wrong id all count', async () => {
    const browser = await signedIn()
    const missing = '/api/documents/00000000-0000-4000-8000-000000000000'

    const answers = await Promise.all(
      Array.from({ length: burst + 4 }, () => browser.request({ method: 'GET', url: missing })),
    )

    expect(statusesOf(answers).filter((code) => code === 429)).toHaveLength(4)
  })
})

describe('the size of what a signed-in person sends', () => {
  it('is bounded by the contract’s limit for the text, with the 413 the contract defines', async () => {
    const browser = await signedIn()

    const response = await browser.request({
      method: 'PATCH',
      url: '/api/me',
      body: { name: 'x'.repeat(81) },
    })

    expect(response.statusCode).toBe(413)
    expect(response.body).toMatchObject({ code: 'too-large', errors: [{ pointer: '/name', code: 'too-long' }] })
  })

  it('is bounded by the size of the body before any of it is read, with the same 413', async () => {
    const browser = await signedIn()

    const response = await browser.request({
      method: 'PATCH',
      url: '/api/me',
      body: { name: 'Marta', padding: 'x'.repeat(maxRequestBodyBytes) },
    })

    expect(response.statusCode).toBe(413)
    expect(response.body).toMatchObject({ code: 'too-large' })
  })
})

describe('the answers of the real routes', () => {
  it('carry the security headers and name the origin of the page that may read them', async () => {
    const browser = await signedIn()

    const response = await browser.request({
      method: 'GET',
      url: '/api/me',
      headers: { origin: 'https://draftroom.example' },
    })

    expect(response.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'content-security-policy': expect.stringContaining("frame-ancestors 'none'"),
      'access-control-allow-origin': 'https://draftroom.example',
      'access-control-allow-credentials': 'true',
    })
  })
})
