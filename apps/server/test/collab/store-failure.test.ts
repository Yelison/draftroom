import { documentName } from '@draftroom/contract/collab'
import type { Kysely } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createPostgresStateStore } from '../../src/collab/stateStore.ts'
import type { Database } from '../../src/db/tables.ts'
import { appendParagraph, storedParagraphs } from '../support/collab/content.ts'
import { ObservedStore } from '../support/collab/observed-store.ts'
import { fastTiming, startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { ClientSet } from '../support/collab/provider-client.ts'
import { settled } from '../support/collab/waiter.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createDocument, createPerson, createWorkspace, join, type Person } from '../support/world.ts'

// A write that fails must not lose what the server already acknowledged (protocol §7.2, ADR 0006): Hocuspocus logs it
// and waits for the next change, so the server retries by itself, keeps the document loaded and waits for it at shutdown.

let database: TestDatabase
let db: Kysely<Database>
let owner: Person
let workspaceId: string
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  workspaceId = await createWorkspace(db)
  owner = await createPerson(db, 'Marta Ruiz')
  await join(db, workspaceId, owner, 'owner')
})
afterAll(() => database.drop())

let collab: CollabHarness | undefined
let clients: ClientSet | undefined
afterEach(async () => {
  clients?.destroyAll()
  await collab?.close()
})

interface Run {
  readonly store: ObservedStore
  readonly harness: CollabHarness
  readonly clients: ClientSet
  readonly documentId: string
}

async function start(timing = fastTiming): Promise<Run> {
  const store = new ObservedStore(createPostgresStateStore(db))
  const harness = await startCollab(db, { store, timing })
  const set = new ClientSet(harness.url)
  collab = harness
  clients = set
  return { store, harness, clients: set, documentId: await createDocument(db, { workspaceId, creator: owner }) }
}

describe('a write that fails', () => {
  it('sends no stored event, is retried without a new edit, and a client that connects meanwhile is told the previous snapshot', async () => {
    const { store, clients, documentId } = await start()
    const editor = clients.open(documentId, { email: owner.email })
    await editor.waitForSynced()
    const first = await editor.waitForStored()
    store.failing = true

    const typed = editor.edit((doc) => appendParagraph(doc, 'not stored yet'))
    // Two failures: the second is the server trying again on its own, with nobody having typed since.
    await store.waitForFailures(2)
    const newcomer = clients.open(documentId, { email: owner.email })
    const told = await newcomer.waitForStored()

    expect(editor.storedEvents).toHaveLength(1)
    expect(told.snapshot).toBe(first.snapshot)
    expect(Y.snapshotContainsUpdate(Y.decodeSnapshot(Buffer.from(told.snapshot, 'base64')), typed)).toBe(false)

    store.failing = false
    await editor.waitForStoredCovering(typed)
    expect(await storedParagraphs(db, documentId)).toEqual(['not stored yet'])
  })

  it('does not lose the change when the last client leaves: the document stays loaded and ends up stored', async () => {
    const { store, harness, clients, documentId } = await start()
    const name = documentName(documentId)
    const editor = clients.open(documentId, { email: owner.email })
    await editor.waitForSynced()
    store.failing = true
    const typed = editor.edit((doc) => appendParagraph(doc, 'written just before leaving'))
    await store.waitForFailures(1)

    editor.destroy()
    await vi.waitFor(() => expect(harness.server.hocuspocus.getConnectionsCount()).toBe(0))
    // The hooks that follow a disconnection are promises, not I/O: once they ran, Hocuspocus has tried to unload it.
    await settled()
    expect(harness.server.hocuspocus.documents.has(name)).toBe(true)

    store.failing = false
    await store.waitForSuccesses(1)
    expect(await storedParagraphs(db, documentId)).toEqual(['written just before leaving'])
    expect(typed.byteLength).toBeGreaterThan(0)
    // Stored, it is let go: nothing keeps a document in memory once its changes are safe.
    await vi.waitFor(() => expect(harness.server.hocuspocus.documents.has(name)).toBe(false))
  })
})

describe('a shutdown', () => {
  it('waits for a write that is being retried, tries it at once and stores it', async () => {
    // A retry that would wait a minute: the document can only be stored in time by the shutdown trying at once.
    const { store, harness, clients, documentId } = await start({ ...fastTiming, retryDelaysMs: [60_000] })
    const editor = clients.open(documentId, { email: owner.email })
    await editor.waitForSynced()
    store.failing = true
    editor.edit((doc) => appendParagraph(doc, 'stored by the shutdown'))
    await store.waitForFailures(1)
    store.failing = false

    const started = performance.now()
    await harness.close()

    expect(await storedParagraphs(db, documentId)).toEqual(['stored by the shutdown'])
    // Stored by the first attempt of the shutdown: it did not wait out a back-off, nor the whole of its wait (3 s).
    expect(performance.now() - started).toBeLessThan(1_500)
  })

  it('keeps trying within its wait, and stores the document when the database comes back during the shutdown', async () => {
    const { store, harness, clients, documentId } = await start()
    const editor = clients.open(documentId, { email: owner.email })
    await editor.waitForSynced()
    store.failing = true
    editor.edit((doc) => appendParagraph(doc, 'stored once the database came back'))
    await store.waitForFailures(1)
    const failedBefore = store.failed

    const closing = harness.close()
    // The shutdown's own attempts fail too: only once it has tried again, with nobody having typed, the database answers.
    await store.waitForFailures(failedBefore + 2)
    store.failing = false
    await closing

    expect(await storedParagraphs(db, documentId)).toEqual(['stored once the database came back'])
  })

  it('finishes within its wait and says which document it could not store, when the write never succeeds', async () => {
    const { store, harness, clients, documentId } = await start({ ...fastTiming, shutdownWaitMs: 300 })
    const editor = clients.open(documentId, { email: owner.email })
    await editor.waitForSynced()
    store.failing = true
    editor.edit((doc) => appendParagraph(doc, 'never stored'))
    await store.waitForFailures(1)

    await harness.close()

    const said = harness.log.entries.filter(
      ({ level, details }) => level === 'error' && JSON.stringify(details).includes(documentName(documentId)),
    )
    expect(said.map(({ message }) => message)).toContain('unloading a document with changes that were never stored')
    expect(await storedParagraphs(db, documentId)).toEqual([])
  })

  it('finishes within its wait and its grace, and names the document, when the write hangs for ever', async () => {
    const { store, harness, clients, documentId } = await start({ ...fastTiming, shutdownWaitMs: 150 })
    const editor = clients.open(documentId, { email: owner.email })
    await editor.waitForSynced()
    store.hanging = true
    editor.edit((doc) => appendParagraph(doc, 'lost in a hung write'))
    await store.waitForHang()

    await harness.close()

    const said = harness.log.entries.filter(
      ({ level, details }) => level === 'error' && JSON.stringify(details).includes(documentName(documentId)),
    )
    expect(said).not.toEqual([])
  })
})
