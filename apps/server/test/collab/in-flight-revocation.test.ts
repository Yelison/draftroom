import { documentName, parseStatelessEvent } from '@draftroom/contract/collab'
import type { Kysely } from 'kysely'
import * as Y from 'yjs'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createPostgresStateStore } from '../../src/collab/stateStore.ts'
import type { Database } from '../../src/db/tables.ts'
import type { AuthProvider } from '../../src/http/auth/auth-provider.ts'
import { createDevIdentity } from '../../src/http/auth/devIdentity.ts'
import { documentWith, paragraphsOfDoc, storedParagraphs } from '../support/collab/content.ts'
import { outgoing } from '../support/collab/frames.ts'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { ObservedStore } from '../support/collab/observed-store.ts'
import { ClientSet } from '../support/collab/provider-client.ts'
import { RawClient } from '../support/collab/raw-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from '../support/world.ts'

// A revocation that falls while a connection is being established (protocol §6.3, T4.1, T7.1). The connection has been
// authenticated and has read the person's role, but it is not registered on the document until the document has loaded,
// so a function that only looks at the registered connections would find nothing and leave the person with the role they
// no longer have. The load is held here, as a busy database would hold it, while the revocation falls in the gap.

const sessionHeader = 'x-test-session'

let database: TestDatabase
let db: Kysely<Database>
let store: ObservedStore
let collab: CollabHarness
let clients: ClientSet
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
  store = new ObservedStore(createPostgresStateStore(db))
  collab = await startCollab(db, { store, authProvider: withSessions })
  clients = new ClientSet(collab.url)
})
afterEach(() => {
  store.releaseLoads()
  clients.destroyAll()
  for (const socket of sockets) socket.terminate()
  sockets = []
})
afterAll(async () => {
  await collab.close()
  await database.drop()
})

let workspaceId: string
let owner: Person
let editor: Person
beforeAll(async () => {
  workspaceId = await createWorkspace(db)
  owner = await createPerson(db, 'Marta Ruiz')
  editor = await createPerson(db, 'Eli Vega')
  await join(db, workspaceId, owner, 'owner')
  await join(db, workspaceId, editor)
})

const newDocument = async () => {
  const documentId = await createDocument(db, { workspaceId, creator: owner })
  await grant(db, { workspaceId, documentId, person: editor, role: 'editor' })
  return documentId
}

/** The editor authenticates and is told so, while the load of the document is held: the connection is in flight. */
async function authenticateWhileLoading(documentId: string, session?: string): Promise<RawClient> {
  store.holdLoads()
  const socket = await RawClient.connect(collab.url, {
    email: editor.email,
    headers: session === undefined ? {} : { [sessionHeader]: session },
  })
  sockets.push(socket)
  socket.authenticate(documentId)
  await socket.waitFor('authenticated')
  await store.waitForHeldLoad()
  return socket
}

/** Someone else reads the document once the load is free: what the revoked connection did, if anything, is in it. */
async function whatIsInTheDocument(documentId: string): Promise<string[]> {
  const witness = clients.open(documentId, { email: owner.email })
  await witness.waitForSynced()
  return paragraphsOfDoc(witness.doc)
}

const forged = (documentId: string) =>
  outgoing.update(documentName(documentId), Y.encodeStateAsUpdate(documentWith('FORGED')))

describe('a revocation while the connection is being established', () => {
  it('closes it with 4403 before it applies a message it had queued, and the message changes nothing', async () => {
    const documentId = await newDocument()
    const socket = await authenticateWhileLoading(documentId)
    await db
      .deleteFrom('document_access')
      .where('document_id', '=', documentId)
      .where('user_id', '=', editor.id)
      .execute()

    const ended = collab.server.endConnections(
      { documentId, userId: editor.id },
      { code: 'access-revoked', event: { type: 'access-changed' } },
    )
    // The connection is not registered yet, so there is nothing live to close.
    expect(ended).toBe(0)
    socket.send(forged(documentId))
    store.releaseLoads()

    expect(await socket.waitForClose()).toEqual({ code: 4403, reason: 'access-revoked' })
    const told = socket.received.flatMap((frame) =>
      frame.kind === 'stateless' ? [parseStatelessEvent(frame.payload)] : [],
    )
    expect(told.filter((event) => event?.type !== 'stored')).toEqual([{ type: 'access-changed' }])
    expect(socket.received.filter((frame) => frame.kind === 'sync-status')).toEqual([])
    expect(await whatIsInTheDocument(documentId)).toEqual([])
    expect(await storedParagraphs(db, documentId)).toEqual([])
  })

  it('closes it as it is registered when it sent nothing, for it not to stay open with the role it lost', async () => {
    const documentId = await newDocument()
    const socket = await authenticateWhileLoading(documentId)
    collab.server.endConnections({ documentId, userId: editor.id }, { code: 'role-changed' })

    store.releaseLoads()

    expect(await socket.waitForClose()).toEqual({ code: 4409, reason: 'role-changed' })
  })

  it('closes it with 4401 when it is the session that ended', async () => {
    const documentId = await newDocument()
    // Another person, in another session, on a document that is already loaded: the end of one session must not reach it.
    const other = await RawClient.connect(collab.url, {
      email: owner.email,
      headers: { [sessionHeader]: 'another-session' },
    })
    sockets.push(other)
    await other.join(await newDocument())
    const socket = await authenticateWhileLoading(documentId, 'session-in-flight')

    collab.server.endConnections({ sessionId: 'session-in-flight' }, { code: 'unauthenticated' })
    socket.send(forged(documentId))
    store.releaseLoads()

    expect(await socket.waitForClose()).toEqual({ code: 4401, reason: 'unauthenticated' })
    expect(await whatIsInTheDocument(documentId)).toEqual([])
    expect(other.isOpen).toBe(true)
  })

  it('leaves alone a connection that authenticated after the revocation, which read what the database says now', async () => {
    const documentId = await newDocument()
    collab.server.endConnections({ documentId, userId: editor.id }, { code: 'role-changed' })

    const later = await RawClient.connect(collab.url, { email: editor.email })
    sockets.push(later)
    await later.join(documentId)
    // A round trip through the registered connection: had a mark closed it, the close would be here already.
    expect(later.isOpen).toBe(true)
  })
})
