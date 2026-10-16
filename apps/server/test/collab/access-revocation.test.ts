import { documentName, parseStatelessEvent } from '@draftroom/contract/collab'
import type { Kysely } from 'kysely'
import * as Y from 'yjs'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { broadcastToDocument } from '../../src/collab/broadcastToDocument.ts'
import { createLiveAccess, factsFromDatabase } from '../../src/collab/revocation.ts'
import { createPostgresStateStore } from '../../src/collab/stateStore.ts'
import type { Database, DocumentRole, GeneralAccess } from '../../src/db/tables.ts'
import type { DocumentBroadcaster } from '../../src/http/document-broadcaster.ts'
import { apiOf, type Api } from '../support/api.ts'
import { appendParagraph, documentWith, paragraphsOfDoc, storedParagraphs } from '../support/collab/content.ts'
import { outgoing } from '../support/collab/frames.ts'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { ObservedStore } from '../support/collab/observed-store.ts'
import { ClientSet } from '../support/collab/provider-client.ts'
import { RawClient } from '../support/collab/raw-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { personFor, scenarios } from '../support/scenarios.ts'
import { createTestApp, type TestApp } from '../support/test-app.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from '../support/world.ts'

// Access that changes while people have the document open (protocol §6.3, plan T4.1): the REST app and the collaboration
// server are wired as the process wires them, the changes are made through the API, and what is looked at is what the
// connections see: the notice, the close and its code, and whether the next thing they send is applied. Clients that speak
// the protocol by hand are used where the test has to send what the real one never would.

let database: TestDatabase
let db: Kysely<Database>
let store: ObservedStore
let collab: CollabHarness
let clients: ClientSet
let server: TestApp
let api: Api
let sockets: RawClient[] = []
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  store = new ObservedStore(createPostgresStateStore(db))
  collab = await startCollab(db, { store })
  clients = new ClientSet(collab.url)
  const broadcaster: DocumentBroadcaster = {
    broadcast: (id, event) => broadcastToDocument(collab.server.hocuspocus, id, event),
  }
  const liveAccess = createLiveAccess({
    facts: factsFromDatabase(db),
    collaboration: collab.server,
    broadcaster,
    log: collab.log,
  })
  server = createTestApp(db, undefined, broadcaster, undefined, liveAccess)
  api = apiOf(server)
})
afterEach(() => {
  store.releaseLoads()
  clients.destroyAll()
  for (const socket of sockets) socket.terminate()
  sockets = []
})
afterAll(async () => {
  await server.app.close()
  await collab.close()
  await database.drop()
})

/** A workspace of its own for a test, because the tests remove people from it. */
interface World {
  readonly workspaceId: string
  readonly owner: Person
  readonly editor: Person
  readonly reader: Person
  readonly bystander: Person
}

async function newWorld(): Promise<World> {
  const workspaceId = await createWorkspace(db)
  const owner = await createPerson(db, 'Marta Ruiz')
  const editor = await createPerson(db, 'Eli Vega')
  const reader = await createPerson(db, 'Vera Lund')
  const bystander = await createPerson(db, 'Tom Weller')
  await join(db, workspaceId, owner, 'owner')
  for (const person of [editor, reader, bystander]) await join(db, workspaceId, person)
  return { workspaceId, owner, editor, reader, bystander }
}

async function newDocument(
  { workspaceId, owner }: World,
  roles: readonly (readonly [Person, DocumentRole])[] = [],
  generalAccess: GeneralAccess = 'none',
): Promise<string> {
  const documentId = await createDocument(db, { workspaceId, creator: owner, generalAccess })
  for (const [person, role] of roles) await grant(db, { workspaceId, documentId, person, role })
  return documentId
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

const forged = (documentId: string) =>
  outgoing.update(documentName(documentId), Y.encodeStateAsUpdate(documentWith('FORGED')))

/** Sends an update made by hand on a new connection of the person, and says whether the server applied it. */
async function sendsForged(documentId: string, person: Person): Promise<{ scope: string; applied: boolean }> {
  const socket = await RawClient.connect(collab.url, { email: person.email })
  sockets.push(socket)
  socket.authenticate(documentId)
  const { scope } = await socket.waitFor('authenticated')
  socket.send(forged(documentId))
  return { scope, applied: (await socket.waitFor('sync-status')).saved }
}

const setAccess = (world: World, documentId: string, person: Person, role: DocumentRole) =>
  api({ as: world.owner, method: 'PUT', url: `/api/documents/${documentId}/access/${person.id}`, body: { role } })
const removeAccess = (world: World, documentId: string, person: Person) =>
  api({ as: world.owner, method: 'DELETE', url: `/api/documents/${documentId}/access/${person.id}` })
const setGeneralAccess = (world: World, documentId: string, generalAccess: GeneralAccess) =>
  api({ as: world.owner, method: 'PUT', url: `/api/documents/${documentId}/general-access`, body: { generalAccess } })

describe('writing content over the WebSocket', () => {
  // Plan §4.3: only an editor and an owner write the content, whatever the way they came to be one. The update is made by
  // hand, as a hostile client makes it; what is looked at is whether the server applied it and whether it was stored.
  const mayWrite = (role: DocumentRole | null): boolean => role === 'editor' || role === 'owner'

  it.each(scenarios)('as a $name ($role)', async (scenario) => {
    const world = await newWorld()
    const documentId = await newDocument(world)
    const subject = await personFor(db, scenario)
    await scenario.arrange({ db, workspaceId: world.workspaceId, documentId, subject })
    const witness = clients.open(documentId, { email: world.owner.email })
    await witness.waitForSynced()

    if (scenario.role === null) {
      const refused = await RawClient.connect(collab.url, { email: subject.email })
      sockets.push(refused)
      refused.authenticate(documentId)
      // The same answer as for a document that is not there: nothing tells them it exists.
      expect((await refused.waitFor('denied')).reason).toBe('not-found')
      return
    }

    const { scope, applied } = await sendsForged(documentId, subject)
    const legitimate = witness.edit((doc) => appendParagraph(doc, 'legitimate'))
    await witness.waitForStoredCovering(legitimate)

    expect({ scope, applied }).toEqual({
      scope: mayWrite(scenario.role) ? 'read-write' : 'readonly',
      applied: mayWrite(scenario.role),
    })
    const stored = await storedParagraphs(db, documentId)
    expect(stored.includes('FORGED')).toBe(mayWrite(scenario.role))
    expect(stored.includes('legitimate')).toBe(true)
  })
})

describe('removing a member from the workspace', () => {
  it('closes their connections in every document of the workspace, and only theirs, with the notice first', async () => {
    const world = await newWorld()
    const { editor, bystander, workspaceId, owner } = world
    const byGrant = await newDocument(world, [
      [editor, 'editor'],
      [bystander, 'editor'],
    ])
    const byGeneralAccess = await newDocument(world, [], 'editor')
    const elsewhere = await createWorkspace(db, 'Almazara')
    await join(db, elsewhere, editor)
    await join(db, elsewhere, bystander, 'owner')
    const inOtherWorkspace = await createDocument(db, { workspaceId: elsewhere, creator: bystander })
    await grant(db, { workspaceId: elsewhere, documentId: inOtherWorkspace, person: editor, role: 'editor' })
    const first = await open(byGrant, editor)
    const second = await open(byGeneralAccess, editor)
    const other = await open(inOtherWorkspace, editor)
    const colleague = await open(byGrant, bystander)

    const removed = await api({
      as: owner,
      method: 'DELETE',
      url: `/api/workspaces/${workspaceId}/members/${editor.id}`,
    })

    expect(removed.statusCode).toBe(204)
    expect(await first.waitForClose()).toEqual({ code: 4403, reason: 'access-revoked' })
    expect(await second.waitForClose()).toEqual({ code: 4403, reason: 'access-revoked' })
    expect([told(first), told(second)]).toEqual([[{ type: 'access-changed' }], [{ type: 'access-changed' }]])
    // Somebody else in the same document, and the same person in a workspace they still belong to, are left alone.
    expect([other.isOpen, colleague.isOpen]).toEqual([true, true])
  })

  it('tells the people who have a document open that it changed hands, when the member owned it alone', async () => {
    const world = await newWorld()
    const orphaned = await createDocument(db, {
      workspaceId: world.workspaceId,
      creator: world.editor,
      generalAccess: 'viewer',
    })
    const watching = await open(orphaned, world.reader)

    await api({
      as: world.owner,
      method: 'DELETE',
      url: `/api/workspaces/${world.workspaceId}/members/${world.editor.id}`,
    })

    await vi.waitFor(() => expect(told(watching)).toEqual([{ type: 'access-changed' }]))
    // Not a revocation for somebody whose access did not change.
    expect(watching.isOpen).toBe(true)
  })
})

describe('changing a role while the person has the document open', () => {
  it('forces an editor made a viewer to reconnect read-only, and the next update they send by hand is not applied', async () => {
    const world = await newWorld()
    const documentId = await newDocument(world, [[world.editor, 'editor']])
    const client = clients.open(documentId, { email: world.editor.email })
    expect(await client.waitForScope()).toBe('read-write')
    await client.waitForSynced()
    const witness = clients.open(documentId, { email: world.owner.email })
    await witness.waitForSynced()

    const lowered = await setAccess(world, documentId, world.editor, 'viewer')

    expect(lowered.statusCode).toBe(200)
    expect(await client.waitForClose()).toEqual({ code: 4409, reason: 'role-changed' })
    // The provider reconnects by itself, and authentication gives it the new mode.
    await vi.waitFor(() => expect(client.scope).toBe('readonly'), { timeout: 8_000 })
    const next = await sendsForged(documentId, world.editor)
    const legitimate = witness.edit((doc) => appendParagraph(doc, 'legitimate'))
    await witness.waitForStoredCovering(legitimate)
    expect(next).toEqual({ scope: 'readonly', applied: false })
    expect(await storedParagraphs(db, documentId)).toEqual(['legitimate'])
  })

  it('makes a viewer made an editor reconnect to be allowed to write', async () => {
    const world = await newWorld()
    const documentId = await newDocument(world, [[world.reader, 'viewer']])
    const socket = await open(documentId, world.reader)

    await setAccess(world, documentId, world.reader, 'editor')

    expect(await socket.waitForClose()).toEqual({ code: 4409, reason: 'role-changed' })
    expect((await sendsForged(documentId, world.reader)).scope).toBe('read-write')
  })

  it.each([
    ['an editor made an owner', 'editor', 'owner'],
    ['a commenter made a viewer', 'commenter', 'viewer'],
  ] as const)('leaves %s connected: the mode they have is the one they keep', async (_change, from, to) => {
    const world = await newWorld()
    const documentId = await newDocument(world, [[world.editor, from]])
    const socket = await open(documentId, world.editor)

    await setAccess(world, documentId, world.editor, to)

    // The notice arrives, so the change has been dealt with, and nothing closed the connection.
    await vi.waitFor(() => expect(told(socket)).toEqual([{ type: 'access-changed' }]))
    expect(socket.isOpen).toBe(true)
  })

  it('closes with 4403 a person whose grant is removed, and with 4409 one who keeps a lower role through the general access', async () => {
    const world = await newWorld()
    const withNothingLeft = await newDocument(world, [[world.editor, 'editor']])
    const withGeneralAccess = await newDocument(world, [[world.editor, 'editor']], 'viewer')
    const revoked = await open(withNothingLeft, world.editor)
    const lowered = await open(withGeneralAccess, world.editor)

    await removeAccess(world, withNothingLeft, world.editor)
    await removeAccess(world, withGeneralAccess, world.editor)

    expect(await revoked.waitForClose()).toEqual({ code: 4403, reason: 'access-revoked' })
    expect(await lowered.waitForClose()).toEqual({ code: 4409, reason: 'role-changed' })
  })

  it('demotes an owner of the workspace on every document: no role left is 4403, a lower one is 4409', async () => {
    const world = await newWorld()
    const promoted = await createPerson(db, 'Ana Ortiz')
    await join(db, world.workspaceId, promoted, 'owner')
    const withNothingElse = await newDocument(world)
    const withAGrant = await newDocument(world, [[promoted, 'viewer']])
    const revoked = await open(withNothingElse, promoted)
    const lowered = await open(withAGrant, promoted)

    const response = await api({
      as: world.owner,
      method: 'PATCH',
      url: `/api/workspaces/${world.workspaceId}/members/${promoted.id}`,
      body: { role: 'member' },
    })

    expect(response.statusCode).toBe(200)
    expect(await revoked.waitForClose()).toEqual({ code: 4403, reason: 'access-revoked' })
    expect(await lowered.waitForClose()).toEqual({ code: 4409, reason: 'role-changed' })
  })
})

describe('changing the general access while people have the document open', () => {
  it('reevaluates only the ones who depend on it: taking it away closes them with 4403 and leaves the ones with a grant', async () => {
    const world = await newWorld()
    const documentId = await newDocument(world, [[world.editor, 'editor']], 'editor')
    const depends = await open(documentId, world.bystander)
    const holdsAGrant = await open(documentId, world.editor)

    await setGeneralAccess(world, documentId, 'none')

    expect(await depends.waitForClose()).toEqual({ code: 4403, reason: 'access-revoked' })
    await vi.waitFor(() => expect(told(holdsAGrant)).toEqual([{ type: 'access-changed' }]))
    expect(holdsAGrant.isOpen).toBe(true)
  })

  it('closes with 4409 the ones whose mode flips when it is lowered from editor to viewer', async () => {
    const world = await newWorld()
    const documentId = await newDocument(world, [[world.editor, 'editor']], 'editor')
    const flipped = await open(documentId, world.bystander)
    const kept = await open(documentId, world.editor)

    await setGeneralAccess(world, documentId, 'viewer')

    expect(await flipped.waitForClose()).toEqual({ code: 4409, reason: 'role-changed' })
    await vi.waitFor(() => expect(told(kept)).toEqual([{ type: 'access-changed' }]))
    expect(kept.isOpen).toBe(true)
  })
})

describe('the notice that access changed', () => {
  it('reaches the people who stay, read-only ones included, once for every change and for none that changes nothing', async () => {
    const world = await newWorld()
    const documentId = await newDocument(world, [[world.reader, 'viewer']])
    const watching = await open(documentId, world.reader)

    await setAccess(world, documentId, world.editor, 'viewer')
    await setAccess(world, documentId, world.editor, 'viewer')
    await setAccess(world, documentId, world.editor, 'commenter')

    await vi.waitFor(() => expect(told(watching)).toHaveLength(2))
    expect(told(watching)).toEqual([{ type: 'access-changed' }, { type: 'access-changed' }])
  })
})

describe('removing access from a connection that is being established', () => {
  it('closes it with 4403 before it applies what it had queued, and the queued update changes nothing', async () => {
    const world = await newWorld()
    const documentId = await newDocument(world, [[world.editor, 'editor']])
    store.holdLoads()
    const socket = await RawClient.connect(collab.url, { email: world.editor.email })
    sockets.push(socket)
    socket.authenticate(documentId)
    await socket.waitFor('authenticated')
    await store.waitForHeldLoad()

    const removed = await removeAccess(world, documentId, world.editor)
    socket.send(forged(documentId))
    store.releaseLoads()

    expect(removed.statusCode).toBe(204)
    expect(await socket.waitForClose()).toEqual({ code: 4403, reason: 'access-revoked' })
    expect(socket.received.filter((frame) => frame.kind === 'sync-status')).toEqual([])
    const witness = clients.open(documentId, { email: world.owner.email })
    await witness.waitForSynced()
    expect(paragraphsOfDoc(witness.doc)).toEqual([])
    expect(await storedParagraphs(db, documentId)).toEqual([])
  })
})
