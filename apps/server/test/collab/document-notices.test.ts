import { documentName, parseStatelessEvent } from '@draftroom/contract/collab'
import type { Schema } from '@draftroom/contract'
import type { Kysely } from 'kysely'
import * as Y from 'yjs'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { broadcastToDocument } from '../../src/collab/broadcastToDocument.ts'
import { createLiveAccess, factsFromDatabase } from '../../src/collab/revocation.ts'
import { createPostgresStateStore } from '../../src/collab/stateStore.ts'
import type { Database } from '../../src/db/tables.ts'
import type { DocumentBroadcaster } from '../../src/http/document-broadcaster.ts'
import type { LiveAccess } from '../../src/http/live-access.ts'
import { apiOf, bodyAs, type Api } from '../support/api.ts'
import { documentWith, storedParagraphs } from '../support/collab/content.ts'
import { outgoing } from '../support/collab/frames.ts'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { ObservedStore } from '../support/collab/observed-store.ts'
import { RawClient } from '../support/collab/raw-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createTestApp, type TestApp } from '../support/test-app.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from '../support/world.ts'

// What the people who have a document open are told, and what happens to their connections, when the document is
// renamed, archived, restored from the archive or deleted for good (protocol §6.3 and §9). The REST app and the
// collaboration server are wired as the process wires them, the changes are made through the API, and what is looked
// at is what each connection receives: the notice, the close and its code, and whether it could still write.

type Document = Schema<'Document'>

let database: TestDatabase
let db: Kysely<Database>
let store: ObservedStore
let collab: CollabHarness
let server: TestApp
let api: Api
let sockets: RawClient[] = []
/** The read of the access facts that a test holds back, as a slow database would: the change is committed and nothing is known yet. */
let heldFacts: { readonly reached: () => void; readonly gate: Promise<void> } | null = null
let workspaceId: string
let owner: Person
let editor: Person
let viewer: Person
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  store = new ObservedStore(createPostgresStateStore(db))
  collab = await startCollab(db, { store })
  const broadcaster: DocumentBroadcaster = {
    broadcast: (id, event) => broadcastToDocument(collab.server.hocuspocus, id, event),
  }
  const real = factsFromDatabase(db)
  const liveAccess = createLiveAccess({
    facts: {
      ...real,
      ofDocument: async (documentId) => {
        const held = heldFacts
        if (held !== null) {
          held.reached()
          await held.gate
        }
        return real.ofDocument(documentId)
      },
    },
    collaboration: collab.server,
    broadcaster,
    log: collab.log,
  })
  server = createTestApp(db, undefined, broadcaster, undefined, liveAccess)
  api = apiOf(server)

  workspaceId = await createWorkspace(db)
  owner = await createPerson(db, 'Marta Ruiz')
  editor = await createPerson(db, 'Eli Vega')
  viewer = await createPerson(db, 'Vera Lund')
  await join(db, workspaceId, owner, 'owner')
  await join(db, workspaceId, editor)
  await join(db, workspaceId, viewer)
})
afterEach(() => {
  heldFacts = null
  store.releaseLoads()
  for (const socket of sockets) socket.terminate()
  sockets = []
})
afterAll(async () => {
  await server.app.close()
  await collab.close()
  await database.drop()
})

/** A document of its own for a test, with an editor and a viewer beside its owner. */
async function newDocument({ archived = false } = {}): Promise<string> {
  const documentId = await createDocument(db, { workspaceId, creator: owner, archived })
  await grant(db, { workspaceId, documentId, person: editor, role: 'editor' })
  await grant(db, { workspaceId, documentId, person: viewer, role: 'viewer' })
  return documentId
}

/** Holds the next read of the access facts of a document until `release`; `reached` says the read was asked for. */
function holdFacts() {
  let release = (): void => undefined
  let reached = (): void => undefined
  const gate = new Promise<void>((resolve) => (release = resolve))
  const wasReached = new Promise<void>((resolve) => (reached = resolve))
  heldFacts = { reached, gate }
  return {
    reached: wasReached,
    release: () => {
      heldFacts = null
      release()
    },
  }
}

/** Sends an update made by hand on an open connection, and says whether the server applied it. */
async function appliesForged(documentId: string, socket: RawClient): Promise<boolean> {
  const mark = socket.mark
  socket.send(forged(documentId))
  return (await socket.waitFor('sync-status', () => true, mark)).saved
}

/** A person with the document open, authenticated and registered. */
async function open(documentId: string, person: Person): Promise<RawClient> {
  const socket = await RawClient.connect(collab.url, { email: person.email })
  sockets.push(socket)
  await socket.join(documentId)
  return socket
}

/** What the server explained to a connection, apart from what it stored. */
const told = (socket: RawClient) =>
  socket.received
    .flatMap((frame) => (frame.kind === 'stateless' ? [parseStatelessEvent(frame.payload)] : []))
    .filter((event) => event?.type !== 'stored')

const revisionOf = async (documentId: string): Promise<number> =>
  bodyAs<Document>(await api({ as: owner, method: 'GET', url: `/api/documents/${documentId}` })).revision

const rename = (documentId: string, title: string, revision: number) =>
  api({ as: editor, method: 'PATCH', url: `/api/documents/${documentId}`, body: { title, revision } })
const archive = (documentId: string) => api({ as: owner, method: 'POST', url: `/api/documents/${documentId}/archive` })
const restore = (documentId: string) => api({ as: owner, method: 'POST', url: `/api/documents/${documentId}/restore` })
const remove = (documentId: string) => api({ as: owner, method: 'DELETE', url: `/api/documents/${documentId}` })

/** Sends an update made by hand on a new connection of the person, and says whether the server applied it. */
async function sendsForged(documentId: string, person: Person): Promise<{ scope: string; applied: boolean }> {
  const socket = await RawClient.connect(collab.url, { email: person.email })
  sockets.push(socket)
  socket.authenticate(documentId)
  const { scope } = await socket.waitFor('authenticated')
  socket.send(forged(documentId))
  return { scope, applied: (await socket.waitFor('sync-status')).saved }
}

const forged = (documentId: string) =>
  outgoing.update(documentName(documentId), Y.encodeStateAsUpdate(documentWith('FORGED')))

describe('renaming a document that people have open', () => {
  it('tells every connection of that document the new title and revision, readers included, and no other document', async () => {
    const documentId = await newDocument()
    const elsewhere = await newDocument()
    const [byOwner, byEditor, byViewer, other] = [
      await open(documentId, owner),
      await open(documentId, editor),
      await open(documentId, viewer),
      await open(elsewhere, owner),
    ]
    const revision = await revisionOf(documentId)

    // A request that changes nothing is not a change: it tells nobody, which is why it comes first.
    expect((await rename(documentId, 'Autumn launch plan', revision)).statusCode).toBe(200)
    const renamed = await rename(documentId, 'Winter launch plan', revision)

    expect(renamed.statusCode).toBe(200)
    const expected = [{ type: 'metadata-changed', title: 'Winter launch plan', revision: revision + 1 }]
    await vi.waitFor(() =>
      expect([told(byOwner), told(byEditor), told(byViewer)]).toEqual([expected, expected, expected]),
    )
    expect([byOwner.isOpen, byEditor.isOpen, byViewer.isOpen]).toEqual([true, true, true])
    expect(told(other)).toEqual([])
  })

  it('tells the connections of a document that was only moved, because its revision moved on', async () => {
    const documentId = await newDocument()
    const watching = await open(documentId, viewer)
    const folderId = bodyAs<Schema<'Folder'>>(
      await api({ as: owner, method: 'POST', url: `/api/workspaces/${workspaceId}/folders`, body: { name: 'Launch' } }),
    ).id
    const revision = await revisionOf(documentId)

    await api({ as: owner, method: 'PATCH', url: `/api/documents/${documentId}`, body: { folderId, revision } })

    await vi.waitFor(() =>
      expect(told(watching)).toEqual([
        { type: 'metadata-changed', title: 'Autumn launch plan', revision: revision + 1 },
      ]),
    )
  })
})

describe('archiving a document that people have open', () => {
  it('ends the connections of the people who are not owners with 4403 and the owner with 4409, the notice first', async () => {
    const documentId = await newDocument()
    const byOwner = await open(documentId, owner)
    const byEditor = await open(documentId, editor)
    const byViewer = await open(documentId, viewer)

    const archived = await archive(documentId)

    expect(archived.statusCode).toBe(200)
    expect(await byEditor.waitForClose()).toEqual({ code: 4403, reason: 'access-revoked' })
    expect(await byViewer.waitForClose()).toEqual({ code: 4403, reason: 'access-revoked' })
    expect(await byOwner.waitForClose()).toEqual({ code: 4409, reason: 'role-changed' })
    for (const socket of [byOwner, byEditor, byViewer]) expect(told(socket)).toEqual([{ type: 'document-archived' }])
  })

  it('takes the right to write at the commit, before the facts that decide how each connection ends are read', async () => {
    const documentId = await newDocument()
    const byEditor = await open(documentId, editor)
    const facts = holdFacts()

    const archiving = archive(documentId)
    await facts.reached
    // The archive is committed and the facts are still being read: nothing the editor sends now may be applied.
    const applied = await appliesForged(documentId, byEditor)
    facts.release()

    expect(applied).toBe(false)
    expect((await archiving).statusCode).toBe(200)
    expect(await byEditor.waitForClose()).toEqual({ code: 4403, reason: 'access-revoked' })
    expect(await storedParagraphs(db, documentId)).toEqual([])
  })

  it('leaves nobody able to write: the editor is refused, and the owner comes back read-only and applies nothing', async () => {
    const documentId = await newDocument()
    const byEditor = await open(documentId, editor)
    await archive(documentId)
    await byEditor.waitForClose()

    const refused = await RawClient.connect(collab.url, { email: editor.email })
    sockets.push(refused)
    refused.authenticate(documentId)

    // The same answer as for a document that is not there.
    expect((await refused.waitFor('denied')).reason).toBe('not-found')
    expect(await sendsForged(documentId, owner)).toEqual({ scope: 'readonly', applied: false })
    expect(await storedParagraphs(db, documentId)).toEqual([])
  })

  it('does not tell anyone again when the document was archived already', async () => {
    const documentId = await newDocument({ archived: true })
    const byOwner = await open(documentId, owner)
    const revision = await revisionOf(documentId)

    const again = await archive(documentId)

    expect(again.statusCode).toBe(200)
    expect(bodyAs<Document>(again).revision).toBe(revision)
    // The round trip of a new connection: had the archive told the owner or closed it, it would have by now.
    await open(documentId, owner)
    expect([byOwner.isOpen, told(byOwner)]).toEqual([true, []])
  })

  describe('while the connection is still being established', () => {
    /** The person authenticates and is told so, while the load of the document is held: the connection is in flight. */
    async function authenticateWhileLoading(documentId: string, person: Person): Promise<RawClient> {
      store.holdLoads()
      const socket = await RawClient.connect(collab.url, { email: person.email })
      sockets.push(socket)
      socket.authenticate(documentId)
      await socket.waitFor('authenticated')
      await store.waitForHeldLoad()
      return socket
    }

    it('takes the right to write from it as it is registered, while the facts are still being read', async () => {
      const documentId = await newDocument()
      const socket = await authenticateWhileLoading(documentId, editor)
      const facts = holdFacts()

      const archiving = archive(documentId)
      await facts.reached
      const mark = socket.mark
      socket.send(forged(documentId))
      store.releaseLoads()
      const applied = (await socket.waitFor('sync-status', () => true, mark)).saved
      facts.release()

      expect(applied).toBe(false)
      expect((await archiving).statusCode).toBe(200)
      expect(await socket.waitForClose()).toEqual({ code: 4403, reason: 'access-revoked' })
      expect(await storedParagraphs(db, documentId)).toEqual([])
    })

    it.each([
      ['an editor', () => editor, { code: 4403, reason: 'access-revoked' }],
      ['an owner', () => owner, { code: 4409, reason: 'role-changed' }],
    ] as const)(
      'closes %s before it applies what it had sent, and the notice goes with it',
      async (_who, person, closed) => {
        const documentId = await newDocument()
        const socket = await authenticateWhileLoading(documentId, person())

        expect((await archive(documentId)).statusCode).toBe(200)
        socket.send(forged(documentId))
        store.releaseLoads()

        expect(await socket.waitForClose()).toEqual(closed)
        expect(told(socket)).toEqual([{ type: 'document-archived' }])
        expect(await storedParagraphs(db, documentId)).toEqual([])
      },
    )
  })
})

describe('restoring a document from the archive', () => {
  it('recycles the connections of its owners with 4409, and they come back able to write', async () => {
    const documentId = await newDocument({ archived: true })
    const byOwner = await open(documentId, owner)

    const restored = await restore(documentId)

    expect(restored.statusCode).toBe(200)
    expect(await byOwner.waitForClose()).toEqual({ code: 4409, reason: 'role-changed' })
    expect(told(byOwner)).toEqual([{ type: 'access-changed' }])
    expect(await sendsForged(documentId, owner)).toEqual({ scope: 'read-write', applied: true })
  })
})

describe('deleting a document for good', () => {
  it('closes every connection with 4403 and says nothing, since nothing is left to explain it', async () => {
    const documentId = await newDocument({ archived: true })
    const byOwner = await open(documentId, owner)

    const deleted = await remove(documentId)

    expect(deleted.statusCode).toBe(204)
    expect(await byOwner.waitForClose()).toEqual({ code: 4403, reason: 'access-revoked' })
    expect(told(byOwner)).toEqual([])
  })
})

describe('when the connections cannot be told', () => {
  // The change is committed and stays; failing to say so is for the log, and the person who asked has nothing to undo.
  const failing = (): Error => new Error('The collaboration server is not there')
  const liveAccess: LiveAccess = {
    documentChanged: () => Promise.reject(failing()),
    documentArchived: () => Promise.reject(failing()),
    documentRestored: () => Promise.reject(failing()),
    documentDeleted: () => Promise.reject(failing()),
    memberChanged: () => Promise.reject(failing()),
    sessionEnded: () => Promise.reject(failing()),
  }
  const broadcaster: DocumentBroadcaster = {
    broadcast: () => {
      throw failing()
    },
  }
  let silent: TestApp
  let silentApi: Api
  beforeAll(() => {
    silent = createTestApp(db, undefined, broadcaster, undefined, liveAccess)
    silentApi = apiOf(silent)
  })
  afterAll(async () => {
    await silent.app.close()
  })

  it('answers the rename, and the new title is there', async () => {
    const documentId = await newDocument()
    const revision = await revisionOf(documentId)

    const renamed = await silentApi({
      as: editor,
      method: 'PATCH',
      url: `/api/documents/${documentId}`,
      body: { title: 'Winter launch plan', revision },
    })

    expect(renamed.statusCode).toBe(200)
    expect(bodyAs<Document>(renamed)).toMatchObject({ title: 'Winter launch plan', revision: revision + 1 })
  })

  it('answers archiving, restoring and deleting, and each stands', async () => {
    const documentId = await newDocument()

    const archived = await silentApi({ as: owner, method: 'POST', url: `/api/documents/${documentId}/archive` })
    const restored = await silentApi({ as: owner, method: 'POST', url: `/api/documents/${documentId}/restore` })
    const archivedAgain = await silentApi({ as: owner, method: 'POST', url: `/api/documents/${documentId}/archive` })
    const deleted = await silentApi({ as: owner, method: 'DELETE', url: `/api/documents/${documentId}` })

    expect([archived, restored, archivedAgain, deleted].map((response) => response.statusCode)).toEqual([
      200, 200, 200, 204,
    ])
    expect(bodyAs<Document>(archived).archivedAt).not.toBeNull()
    expect(bodyAs<Document>(restored).archivedAt).toBeNull()
    expect(
      await db.selectFrom('documents').select('id').where('id', '=', documentId).executeTakeFirst(),
    ).toBeUndefined()
  })
})
