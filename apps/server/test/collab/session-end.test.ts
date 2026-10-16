import type { Connection } from '@hocuspocus/server'
import type { Kysely } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { ConnectionContext } from '../../src/collab/context.ts'
import { sessionKey } from '../../src/collab/sessionKey.ts'
import type { Database } from '../../src/db/tables.ts'
import type { AuthProvider } from '../../src/http/auth/auth-provider.ts'
import { createDevIdentity } from '../../src/http/auth/devIdentity.ts'
import { documentName } from '@draftroom/contract/collab'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { RawClient } from '../support/collab/raw-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createDocument, createPerson, createWorkspace, join, type Person } from '../support/world.ts'

// A session that ends closes its own connections and nobody else's (protocol §6.3, T7.1). There is no session to sign out
// of yet, so the identity of these tests gives each connection the session its header names; the function that ends them
// is the one T7.1 will call.

const testSecret = 'a-secret-that-is-long-enough-for-a-hash'
const sessionHeader = 'x-test-session'

let database: TestDatabase
let db: Kysely<Database>
let collab: CollabHarness
let sockets: RawClient[] = []
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  const developer = createDevIdentity(db)
  // The development identity, plus the session its caller says it has.
  const withSessions: AuthProvider = {
    async authenticate(request, requirement) {
      const authentication = await developer.authenticate(request, requirement)
      if (authentication.status !== 'authenticated') return authentication
      const session = request.headers[sessionHeader]
      return {
        status: 'authenticated',
        principal: {
          userId: authentication.principal.userId,
          sessionId: typeof session === 'string' ? session : undefined,
        },
      }
    },
  }
  collab = await startCollab(db, { authProvider: withSessions, config: { sessionSecret: testSecret } })
})
afterEach(() => {
  for (const socket of sockets) socket.terminate()
  sockets = []
})
afterAll(async () => {
  await collab.close()
  await database.drop()
})

let workspaceId: string
let marta: Person
let eli: Person
beforeAll(async () => {
  workspaceId = await createWorkspace(db)
  marta = await createPerson(db, 'Marta Ruiz')
  eli = await createPerson(db, 'Eli Vega')
  await join(db, workspaceId, marta, 'owner')
  await join(db, workspaceId, eli, 'owner')
})

const newDocument = () => createDocument(db, { workspaceId, creator: marta, generalAccess: 'editor' })

async function connect(documentId: string, person: Person, session?: string): Promise<RawClient> {
  const socket = await RawClient.connect(collab.url, {
    email: person.email,
    headers: session === undefined ? {} : { [sessionHeader]: session },
  })
  sockets.push(socket)
  await socket.join(documentId)
  return socket
}

describe('a session that ends', () => {
  it('closes its connections, on every document, with 4401, and leaves every other connection open', async () => {
    const first = await newDocument()
    const second = await newDocument()
    const sessionOnFirst = await connect(first, marta, 'session-one')
    const sessionOnSecond = await connect(second, marta, 'session-one')
    // The same person on another device, another person, and a connection whose identity has no session.
    const otherDevice = await connect(first, marta, 'session-two')
    const otherPerson = await connect(first, eli, 'session-three')
    const noSession = await connect(first, marta)

    const ended = collab.server.endConnections({ sessionId: 'session-one' }, { code: 'unauthenticated' })

    expect(ended).toBe(2)
    expect(await sessionOnFirst.waitForClose()).toEqual({ code: 4401, reason: 'unauthenticated' })
    expect(await sessionOnSecond.waitForClose()).toEqual({ code: 4401, reason: 'unauthenticated' })
    expect([otherDevice, otherPerson, noSession].map((socket) => socket.isOpen)).toEqual([true, true, true])
  })

  it('matches no connection when no connection has that session, and never one that has no session at all', async () => {
    const documentId = await newDocument()
    const noSession = await connect(documentId, marta)

    const ended = [
      collab.server.endConnections({ sessionId: 'session-nobody-has' }, { code: 'unauthenticated' }),
      collab.server.endConnections({ sessionId: '' }, { code: 'unauthenticated' }),
    ]

    expect(ended).toEqual([0, 0])
    expect(noSession.isOpen).toBe(true)
  })
})

describe('what a connection remembers of its session', () => {
  it('is a keyed hash, and never the session id, which could be used as the session', async () => {
    const documentId = await newDocument()
    await connect(documentId, marta, 'session-secret-value')

    const live = collab.server.hocuspocus.documents.get(documentName(documentId))
    const [connection] = (live?.getConnections() ?? []) as Connection<ConnectionContext>[]

    expect(connection?.context.sessionId).toBe(sessionKey(testSecret, 'session-secret-value'))
    expect(connection?.context.sessionId).not.toContain('session-secret-value')
  })
})
