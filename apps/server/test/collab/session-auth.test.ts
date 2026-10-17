import { documentName } from '@draftroom/contract/collab'
import type { Kysely } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createLiveAccess, factsFromDatabase } from '../../src/collab/revocation.ts'
import type { Database } from '../../src/db/tables.ts'
import { sessionPolicy } from '../../src/http/auth/sessions.ts'
import { startSessionSweep, type SessionSweep } from '../../src/http/auth/sessionSweep.ts'
import { Browser, sessionStackFor, type SessionStack } from '../support/auth.ts'
import { silentBroadcaster } from '../support/broadcasters.ts'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { outgoing } from '../support/collab/frames.ts'
import { RawClient } from '../support/collab/raw-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createTestApp, type TestApp } from '../support/test-app.ts'
import { createDocument, createPendingPerson, createPerson, createWorkspace, grant, join } from '../support/world.ts'

// The collaboration server resolves the session from the cookie of the upgrade, and from nothing else (protocol §3.3), and a
// session that ends takes its connections with it (§6.3). The REST side is the real app, over the same sessions and the same
// collaboration server, so sign-out does what it does in production.

const generous = { max: 10_000, windowMs: 60_000 }
let database: TestDatabase
let db: Kysely<Database>
let clock: Date
let stack: SessionStack
let collab: CollabHarness
let rest: TestApp
let sweep: SessionSweep
let documentId: string
let workspaceId: string
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  clock = new Date()
  stack = sessionStackFor(db, { now: () => clock })
  collab = await startCollab(db, { authProvider: stack.provider })
  const liveAccess = createLiveAccess({
    facts: factsFromDatabase(db),
    collaboration: collab.server,
    broadcaster: silentBroadcaster,
    log: collab.log,
  })
  rest = createTestApp(db, stack.provider, undefined, undefined, liveAccess, undefined, {
    session: stack,
    rateLimits: { signInFailuresPerEmail: generous, signInFailuresPerAddress: generous, signUpsPerAddress: generous },
  })
  // The timer is not what is under test: the sweep is run by hand.
  sweep = startSessionSweep({ sessions: stack.sessions, liveAccess, log: collab.log, intervalMs: 3_600_000 })

  workspaceId = await createWorkspace(db)
  const owner = await createPerson(db, 'Marta Ruiz')
  await join(db, workspaceId, owner, 'owner')
  documentId = await createDocument(db, { workspaceId, creator: owner })
})
afterAll(async () => {
  sweep.stop()
  await rest.app.close()
  await collab.close()
  await database.drop()
})

let sockets: RawClient[] = []
afterEach(() => {
  for (const socket of sockets) socket.terminate()
  sockets = []
  clock = new Date()
})

/** A person invited to edit the document who then signs up: the way somebody comes to have a session and a seat. */
async function signedUpEditor(): Promise<{ browser: Browser; password: string; email: string }> {
  const invited = await createPendingPerson(db)
  await join(db, workspaceId, invited, 'member')
  await grant(db, { workspaceId, documentId, person: { ...invited, name: 'Invited' }, role: 'editor' })
  const browser = new Browser(rest)
  const password = 'correct horse battery staple'
  const response = await browser.request({
    method: 'POST',
    url: '/api/auth/sign-up',
    body: { email: invited.email, password, name: 'Eli Vega' },
  })
  expect(response.statusCode).toBe(201)
  return { browser, password, email: invited.email }
}

const cookieOf = (browser: Browser): string => `dr_session=${browser.cookies.get('dr_session') ?? ''}`

async function connect(headers: Record<string, string>, url = collab.url): Promise<RawClient> {
  const socket = await RawClient.connect(url, { headers })
  sockets.push(socket)
  return socket
}

/** Opens the connection and asks for the document, which is where a refusal is told. */
async function denial(headers: Record<string, string>, url = collab.url): Promise<string> {
  const socket = await connect(headers, url)
  socket.authenticate(documentId)
  return (await socket.waitFor('denied')).reason
}

describe('a connection with the session cookie', () => {
  it('is the person the session belongs to, and is let into the document they hold', async () => {
    const { browser } = await signedUpEditor()
    const socket = await connect({ cookie: cookieOf(browser) })

    await socket.join(documentId)

    expect(socket.isOpen).toBe(true)
  })
})

describe('a connection that is refused', () => {
  it('has no session cookie', async () => {
    expect(await denial({})).toBe('unauthenticated')
  })

  it('has a session cookie that was never issued', async () => {
    expect(await denial({ cookie: 'dr_session=a-token-nobody-issued' })).toBe('unauthenticated')
  })

  it('names the session in the address, which is never where an identity is read from', async () => {
    const { browser } = await signedUpEditor()
    const token = browser.cookies.get('dr_session') ?? ''

    const reasons = await Promise.all([
      denial({}, `${collab.url}?token=${token}`),
      denial({}, `${collab.url}?session=${token}&dr_session=${token}`),
      denial({ authorization: `Bearer ${token}` }),
    ])

    expect(reasons).toEqual(['unauthenticated', 'unauthenticated', 'unauthenticated'])
  })

  it('names the session in the token of its first message, which the provider never sends and the server ignores', async () => {
    const { browser } = await signedUpEditor()
    const socket = await connect({})

    socket.send(outgoing.authenticate(documentName(documentId), browser.cookies.get('dr_session') ?? ''))

    expect((await socket.waitFor('denied')).reason).toBe('unauthenticated')
  })

  it('has a session that has been idle for too long', async () => {
    const { browser } = await signedUpEditor()
    clock = new Date(clock.getTime() + sessionPolicy.idleMs + 60_000)

    expect(await denial({ cookie: cookieOf(browser) })).toBe('unauthenticated')
  })
})

describe('signing out', () => {
  it('closes the live connections of the session with 4401, and refuses the same cookie afterwards', async () => {
    const { browser } = await signedUpEditor()
    const cookie = cookieOf(browser)
    const live = await connect({ cookie })
    await live.join(documentId)

    const signOut = await browser.request({ method: 'POST', url: '/api/auth/sign-out' })

    expect(signOut.statusCode).toBe(204)
    expect(await live.waitForClose()).toEqual({ code: 4401, reason: 'unauthenticated' })
    expect(await denial({ cookie })).toBe('unauthenticated')
  })

  it('leaves the connections of the same person on another device, which is another session', async () => {
    const { browser, email, password } = await signedUpEditor()
    const phone = new Browser(rest)
    await phone.request({ method: 'POST', url: '/api/auth/sign-in', body: { email, password } })
    const laptopSocket = await connect({ cookie: cookieOf(browser) })
    const phoneSocket = await connect({ cookie: cookieOf(phone) })
    await Promise.all([laptopSocket.join(documentId), phoneSocket.join(documentId)])

    await browser.request({ method: 'POST', url: '/api/auth/sign-out' })

    expect(await laptopSocket.waitForClose()).toMatchObject({ code: 4401 })
    expect(phoneSocket.isOpen).toBe(true)
  })

  it('does not close the connection of somebody else, who is not that session', async () => {
    const [leaving, staying] = [await signedUpEditor(), await signedUpEditor()]
    const stayingSocket = await connect({ cookie: cookieOf(staying.browser) })
    await stayingSocket.join(documentId)

    await leaving.browser.request({ method: 'POST', url: '/api/auth/sign-out' })

    expect(stayingSocket.isOpen).toBe(true)
  })

  it('is also what signing in again does to the connections the browser had', async () => {
    const { browser, email, password } = await signedUpEditor()
    const before = await connect({ cookie: cookieOf(browser) })
    await before.join(documentId)

    await browser.request({ method: 'POST', url: '/api/auth/sign-in', body: { email, password } })

    expect(await before.waitForClose()).toEqual({ code: 4401, reason: 'unauthenticated' })
  })
})

describe('a session that ends by time with a connection open', () => {
  it('has its connection closed by the sweep with 4401, and its cookie refused', async () => {
    const { browser } = await signedUpEditor()
    const cookie = cookieOf(browser)
    const live = await connect({ cookie })
    await live.join(documentId)
    clock = new Date(clock.getTime() + sessionPolicy.idleMs + 60_000)

    const removed = await sweep.run()

    expect(removed).toBeGreaterThanOrEqual(1)
    expect(await live.waitForClose()).toEqual({ code: 4401, reason: 'unauthenticated' })
    expect(await denial({ cookie })).toBe('unauthenticated')
  })

  it('is not touched while it is still in force', async () => {
    const { browser } = await signedUpEditor()
    const live = await connect({ cookie: cookieOf(browser) })
    await live.join(documentId)
    clock = new Date(clock.getTime() + sessionPolicy.idleMs - 60_000)

    await sweep.run()

    expect(live.isOpen).toBe(true)
  })
})
