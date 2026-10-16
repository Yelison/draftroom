import { documentName, type StatelessEvent } from '@draftroom/contract/collab'
import type { Schema } from '@draftroom/contract'
import type { Kysely } from 'kysely'
import * as Y from 'yjs'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { broadcastToDocument } from '../../src/collab/broadcastToDocument.ts'
import { postgresRestoreVersions, type RestoreVersions } from '../../src/collab/restoreVersions.ts'
import { createPostgresStateStore, type StateStore } from '../../src/collab/stateStore.ts'
import type { Database } from '../../src/db/tables.ts'
import { RESTORE_CAPTURE_ATTEMPTS, RESTORE_COMMIT_ATTEMPTS } from '../../src/domain/versions.ts'
import type { DocumentBroadcaster } from '../../src/http/document-broadcaster.ts'
import { apiOf, bodyAs, type Api } from '../support/api.ts'
import {
  appendParagraph,
  documentWith,
  paragraphsOf,
  paragraphsOfDoc,
  storedParagraphs,
  storeState,
} from '../support/collab/content.ts'
import { forbiddenContent } from '../support/collab/forbidden-content.ts'
import { fastTiming, startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { ClientSet, type DocumentClient } from '../support/collab/provider-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createTestApp, type TestApp } from '../support/test-app.ts'
import { createVersion, versionsOf } from '../support/versions.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from '../support/world.ts'

// Restoring a version over the real collaboration server, the real database and `HocuspocusProvider` clients (protocol
// §11.4, ADR 0007 and 0014). The sequence is the protocol's; each test pins one thing that goes wrong if it is not.

type Version = Schema<'Version'>

const stateOf = (...paragraphs: string[]): Uint8Array => Y.encodeStateAsUpdate(documentWith(...paragraphs))

const snapshotOfState = (state: Uint8Array): Y.Snapshot => {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, state)
  return Y.snapshot(doc)
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Looks again until what is looked for is there: for what happens on another connection, after the answer is given. */
async function eventually<Found>(
  look: () => Promise<Found | undefined> | Found | undefined,
  what: string,
): Promise<Found> {
  const deadline = Date.now() + 8_000
  for (;;) {
    const found = await look()
    if (found !== undefined) return found
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`)
    await pause(20)
  }
}

let database: TestDatabase
let db: Kysely<Database>
let workspaceId: string
let owner: Person
let editorA: Person
let editorB: Person
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  workspaceId = await createWorkspace(db)
  owner = await createPerson(db, 'Marta Ruiz')
  editorA = await createPerson(db, 'Priya Raman')
  editorB = await createPerson(db, 'Daniel Okafor')
  await join(db, workspaceId, owner, 'owner')
  await join(db, workspaceId, editorA)
  await join(db, workspaceId, editorB)
})
afterAll(() => database.drop())

interface WorldOptions {
  /** Wraps what a restore keeps in the database, to make it slow, make it fail or let something happen in the middle. */
  readonly versions?: (real: RestoreVersions) => RestoreVersions
  /** Wraps where the document state is stored, for a write that takes its time. */
  readonly store?: (real: StateStore) => StateStore
  /** How long the server waits after a change to store the document; long, so that no store takes the mutex unannounced. */
  readonly debounceMs?: number
}

interface World {
  readonly collab: CollabHarness
  readonly clients: ClientSet
  readonly server: TestApp
  readonly api: Api
  /** What the app told the connections of a document, in order. */
  readonly told: Array<{ documentId: string; event: StatelessEvent }>
  close(): Promise<void>
}

/** The REST app wired to a collaboration server as the process wires them. */
async function startWorld({ versions, store, debounceMs }: WorldOptions = {}): Promise<World> {
  const collab = await startCollab(db, {
    ...(debounceMs === undefined
      ? {}
      : { timing: { ...fastTiming, debounceMs, maxDebounceMs: Math.max(debounceMs, fastTiming.maxDebounceMs) } }),
    restoreVersions: (versions ?? ((real) => real))(postgresRestoreVersions(db)),
    store: (store ?? ((real) => real))(createPostgresStateStore(db)),
  })
  const told: World['told'] = []
  const broadcaster: DocumentBroadcaster = {
    broadcast: (documentId, event) => {
      told.push({ documentId, event })
      broadcastToDocument(collab.server.hocuspocus, documentId, event)
    },
  }
  const server = createTestApp(db, undefined, broadcaster, undefined, undefined, collab.server.documents)
  const clients = new ClientSet(collab.url)
  return {
    collab,
    clients,
    server,
    api: apiOf(server),
    told,
    async close() {
      clients.destroyAll()
      await server.app.close()
      await collab.close()
    },
  }
}

/** A document of the workspace with this content stored; the two editors may edit it. */
async function freshDocument(...paragraphs: string[]): Promise<string> {
  const documentId = await createDocument(db, { workspaceId, creator: owner })
  await grant(db, { workspaceId, documentId, person: editorA, role: 'editor' })
  await grant(db, { workspaceId, documentId, person: editorB, role: 'editor' })
  await storeState(db, documentId, stateOf(...paragraphs))
  return documentId
}

const versionOf = (documentId: string, ...paragraphs: string[]): Promise<string> =>
  createVersion(db, {
    workspaceId,
    documentId,
    author: owner,
    label: 'An earlier draft',
    state: stateOf(...paragraphs),
  })

const restore = (versionId: string, as: Person = owner) =>
  world.api({ as, method: 'POST', url: `/api/versions/${versionId}/restore` })

const liveDocument = (documentId: string) => world.collab.server.hocuspocus.documents.get(documentName(documentId))

/** Changes the document as it is in the server's memory, the way a person connected to it would. */
function typeOnServer(documentId: string, text: string): void {
  const live = liveDocument(documentId)
  if (live === undefined) throw new Error('The document is not loaded')
  live.transact(() => appendParagraph(live, text))
}

const eventsOf = (documentId: string) =>
  db.selectFrom('activity_events').select(['type', 'actor_id']).where('document_id', '=', documentId).execute()

const kindsOf = async (documentId: string) => (await versionsOf(db, documentId)).map((version) => version.kind)

let world: World
afterEach(async () => {
  vi.restoreAllMocks()
  await world.close()
})

describe('restoring a version into a document nobody has open', () => {
  it('stores the content of the version, keeps what it replaced, and gives the restore version', async () => {
    world = await startWorld()
    const documentId = await freshDocument('Current')
    const versionId = await versionOf(documentId, 'Old one', 'Old two')

    const response = await restore(versionId)

    expect(response.statusCode).toBe(200)
    expect(bodyAs<Version>(response)).toMatchObject({
      documentId,
      kind: 'restore',
      createdBy: { id: owner.id, name: 'Marta Ruiz' },
    })
    expect(await storedParagraphs(db, documentId)).toEqual(['Old one', 'Old two'])
    const saved = await versionsOf(db, documentId)
    expect(saved.map((version) => version.kind)).toEqual(['manual', 'pre-restore', 'restore'])
    expect(saved.map((version) => paragraphsOf(version.state))).toEqual([
      ['Old one', 'Old two'],
      ['Current'],
      ['Old one', 'Old two'],
    ])
    expect(saved[2]?.id).toBe(bodyAs<Version>(response).id)
  })

  it('records the restore in the history and tells the people who have the document open', async () => {
    world = await startWorld()
    const documentId = await freshDocument('Current')

    await restore(await versionOf(documentId, 'Old'))

    expect(await eventsOf(documentId)).toEqual([{ type: 'version.restored', actor_id: owner.id }])
    expect(world.told).toEqual([{ documentId, event: { type: 'versions-changed' } }])
  })

  it('leaves the document unloaded again, which says the direct connection was closed', async () => {
    world = await startWorld()
    const documentId = await freshDocument('Current')

    await restore(await versionOf(documentId, 'Old'))

    await eventually(() => (liveDocument(documentId) === undefined ? true : undefined), 'the document to unload')
  })
})

describe('restoring a version into a document that people have open', () => {
  it('reaches an editor as a normal update, written by the transaction origin `restore`', async () => {
    world = await startWorld()
    const documentId = await freshDocument('Current')
    const editor = world.clients.open(documentId, { email: editorA.email })
    await editor.waitForSynced()
    const origins: unknown[] = []
    liveDocument(documentId)?.on('update', (_update: Uint8Array, origin: unknown) => origins.push(origin))

    await restore(await versionOf(documentId, 'Old one', 'Old two'))

    await editor.waitForDoc('the restored content', (doc) => paragraphsOfDoc(doc).includes('Old two'))
    expect(paragraphsOfDoc(editor.doc)).toEqual(['Old one', 'Old two'])
    expect(origins).toEqual(['restore'])
    expect(
      await eventually(async () => {
        const stored = await storedParagraphs(db, documentId)
        return stored.includes('Old two') ? stored : undefined
      }, 'the restored content to be stored'),
    ).toEqual(['Old one', 'Old two'])
  })

  it('tells a person who connects afterwards, with the restored content in their copy, that it is stored', async () => {
    // From the restore on, no store can write: what the restore wrote itself is the only thing the server can say is stored.
    let refusing = false
    world = await startWorld({
      store: (real) => ({
        load: (documentId) => real.load(documentId),
        save: (documentId, state) =>
          refusing ? Promise.reject(new Error('The database refused the write')) : real.save(documentId, state),
      }),
    })
    const documentId = await freshDocument('Current')
    const versionId = await versionOf(documentId, 'Old one', 'Old two')
    const present = world.clients.open(documentId, { email: editorA.email })
    await present.waitForSynced()
    refusing = true

    const response = await restore(versionId)

    expect(response.statusCode).toBe(200)
    const restored = (await versionsOf(db, documentId)).find((version) => version.id === bodyAs<Version>(response).id)
    const copy = new Y.Doc()
    Y.applyUpdate(copy, restored?.state ?? new Uint8Array())
    const person = world.clients.open(documentId, { email: editorB.email, doc: copy })
    // The copy holds the restored content and nothing the server lacks: it is stored exactly when the server says it wrote it.
    await person.waitForStoredCovering(Y.encodeStateAsUpdate(copy))
  })

  it('keeps the nodes it did not have to change: an edit in flight to one survives, and one to a removed node is lost', async () => {
    world = await startWorld()
    const documentId = await freshDocument('Kept', 'Removed')
    const editor = world.clients.open(documentId, { email: editorA.email })
    await editor.waitForSynced()
    // Edits that were already on their way when the restore applied: made by a person who has not yet heard of it.
    const person = new Y.Doc()
    Y.applyUpdate(person, Y.encodeStateAsUpdate(editor.doc))
    const inFlight: Uint8Array[] = []
    person.on('update', (update: Uint8Array) => inFlight.push(update))
    for (const [index, text] of [
      [0, 'Edited '],
      [1, 'Lost '],
    ] as const) {
      const paragraph = person.getXmlFragment('default').get(index)
      if (!(paragraph instanceof Y.XmlElement) || !(paragraph.get(0) instanceof Y.XmlText))
        throw new Error('No paragraph')
      ;(paragraph.get(0) as Y.XmlText).insert(0, text)
    }

    await restore(await versionOf(documentId, 'Kept'))
    const live = liveDocument(documentId)
    if (live === undefined) throw new Error('The document is not loaded')
    for (const update of inFlight) Y.applyUpdate(live, update)

    expect(paragraphsOfDoc(live)).toEqual(['Edited Kept'])
  })

  it('is not undone by a store that started before it: the old content is written before the restore begins to commit, never after', async () => {
    const order: string[] = []
    let releaseWrite: () => void = () => undefined
    let writeStarted: () => void = () => undefined
    const started = new Promise<void>((resolve) => (writeStarted = resolve))
    let held = true
    world = await startWorld({
      store: (real) => ({
        load: (documentId) => real.load(documentId),
        async save(documentId, state) {
          if (!held) return real.save(documentId, state)
          held = false
          writeStarted()
          await new Promise<void>((resolve) => (releaseWrite = resolve))
          await real.save(documentId, state)
          order.push('the store that was in flight wrote the old content')
        },
      }),
      versions: (real) => ({
        ...real,
        commit(restored) {
          order.push('the restore began to commit')
          return real.commit(restored)
        },
      }),
    })
    const documentId = await freshDocument('Current')
    const versionId = await versionOf(documentId, 'Restored')
    const editor = world.clients.open(documentId, { email: editorA.email })
    await editor.waitForSynced()
    editor.edit((doc) => appendParagraph(doc, 'Typed before'))
    // The store has captured 'Current' and 'Typed before' and is waiting to write them.
    await started

    const restoring = restore(versionId)
    await pause(150)
    releaseWrite()
    const response = await restoring

    expect(response.statusCode).toBe(200)
    expect(order).toEqual(['the store that was in flight wrote the old content', 'the restore began to commit'])
    expect(
      await eventually(async () => {
        const stored = await storedParagraphs(db, documentId)
        return stored.includes('Restored') ? stored : undefined
      }, 'the restored content to be stored'),
    ).toEqual(['Restored'])
    await pause(200)
    expect(await storedParagraphs(db, documentId)).toEqual(['Restored'])
  })
})

describe('restoring while two connected editors keep typing', () => {
  /** Types one character at the end of a paragraph every few milliseconds, as a person does, and notes what was typed. */
  function typing(client: DocumentClient, paragraphIndex: number, letter: string) {
    const typed: string[] = []
    let typingNow = true
    const done = (async () => {
      while (typingNow) {
        client.edit((doc) => {
          const paragraph = doc.getXmlFragment('default').get(paragraphIndex)
          if (!(paragraph instanceof Y.XmlElement)) throw new Error('The paragraph is missing')
          const text = paragraph.get(0)
          if (!(text instanceof Y.XmlText)) throw new Error('The paragraph has no text')
          text.insert(text.length, letter)
        })
        typed.push(letter)
        await pause(12)
      }
    })()
    return {
      typed,
      async stop() {
        typingNow = false
        await done
      },
    }
  }

  it('ends with the restored content plus what was typed after it, keeps exactly the state it replaced, and raises nothing', async () => {
    world = await startWorld()
    const documentId = await freshDocument('Alpha', 'Beta')
    const versionId = await versionOf(documentId, 'Alpha', 'Beta')
    const a = world.clients.open(documentId, { email: editorA.email })
    const b = world.clients.open(documentId, { email: editorB.email })
    await Promise.all([a.waitForSynced(), b.waitForSynced()])
    const live = liveDocument(documentId)
    if (live === undefined) throw new Error('The document is not loaded')
    let replaced: Uint8Array | undefined
    live.on('beforeTransaction', (transaction: Y.Transaction) => {
      if (transaction.origin === 'restore') replaced = Y.encodeStateAsUpdate(live)
    })

    const typingA = typing(a, 0, 'a')
    const typingB = typing(b, 1, 'b')
    await eventually(
      () =>
        paragraphsOfDoc(live).join('').match(/a{3}/) && paragraphsOfDoc(live).join('').match(/b{3}/) ? true : undefined,
      'both editors to have typed',
    )
    // Under continuous typing the verification can fail every time, and the owner is told to try again.
    let response = await restore(versionId)
    for (let retry = 0; retry < 5 && response.statusCode === 409; retry += 1) response = await restore(versionId)
    await pause(300)
    await typingA.stop()
    await typingB.stop()

    expect(response.statusCode).toBe(200)
    if (replaced === undefined) throw new Error('The restore never changed the document')
    // The restored content, and after it every letter typed once the restore had been applied, in the order it was typed.
    const [beforeA = '', beforeB = ''] = paragraphsOf(replaced)
    const expected = [
      'Alpha' + 'a'.repeat(typingA.typed.length - (beforeA.length - 'Alpha'.length)),
      'Beta' + 'b'.repeat(typingB.typed.length - (beforeB.length - 'Beta'.length)),
    ]
    await eventually(
      async () => ((await storedParagraphs(db, documentId)).join() === expected.join() ? true : undefined),
      'the typing after the restore to be stored',
    )
    const preRestore = (await versionsOf(db, documentId)).filter((version) => version.kind === 'pre-restore')
    expect(preRestore).toHaveLength(1)
    // What the restore replaced is exactly what the document held when it did: nothing typed fell between the two.
    expect(Y.equalSnapshots(snapshotOfState(preRestore[0]?.state ?? new Uint8Array()), snapshotOfState(replaced))).toBe(
      true,
    )
    expect(await storedParagraphs(db, documentId)).toEqual(expected)
    expect(world.collab.log.entries.filter((entry) => entry.level === 'error')).toEqual([])
  })
})

describe('the sequence of a restore, when the document changes under it or the database fails', () => {
  /** Makes an edit arrive during the write of the `pre-restore` version, `times` times: the one await before the change. */
  const interruptedPasses =
    (times: number, counter: { passes: number }) =>
    (real: RestoreVersions): RestoreVersions => ({
      ...real,
      async savePreRestore(version) {
        counter.passes += 1
        await real.savePreRestore(version)
        if (counter.passes <= times) typeOnServer(version.documentId, `Typed during pass ${counter.passes}`)
      },
    })

  it('leaves one pre-restore version when it has to look again, and it is the state that was replaced', async () => {
    const counter = { passes: 0 }
    world = await startWorld({ versions: interruptedPasses(1, counter) })
    const documentId = await freshDocument('Current')
    const versionId = await versionOf(documentId, 'Old')

    const response = await restore(versionId)

    expect(response.statusCode).toBe(200)
    expect(counter.passes).toBe(2)
    expect(await kindsOf(documentId)).toEqual(['manual', 'pre-restore', 'restore'])
    const [, preRestore] = await versionsOf(db, documentId)
    expect(paragraphsOf(preRestore?.state ?? new Uint8Array())).toEqual(['Current', 'Typed during pass 1'])
    expect(
      await eventually(async () => {
        const stored = await storedParagraphs(db, documentId)
        return stored.includes('Old') ? stored : undefined
      }, 'the restored content to be stored'),
    ).toEqual(['Old'])
  })

  it('gives up with a conflict after three attempts, and leaves no version, no event and no notice behind', async () => {
    const counter = { passes: 0 }
    world = await startWorld({ versions: interruptedPasses(RESTORE_CAPTURE_ATTEMPTS, counter) })
    const documentId = await freshDocument('Current')
    const versionId = await versionOf(documentId, 'Old')

    const response = await restore(versionId)

    expect(response.statusCode).toBe(409)
    expect(response.body).toMatchObject({ code: 'conflict' })
    expect(counter.passes).toBe(RESTORE_CAPTURE_ATTEMPTS)
    expect(await kindsOf(documentId)).toEqual(['manual'])
    expect([await eventsOf(documentId), world.told]).toEqual([[], []])
    // The document was not replaced: what people typed meanwhile is all there is.
    expect(
      await eventually(async () => {
        const stored = await storedParagraphs(db, documentId)
        return stored.length === 4 ? stored : undefined
      }, 'the edits made meanwhile to be stored'),
    ).toEqual(['Current', 'Typed during pass 1', 'Typed during pass 2', 'Typed during pass 3'])
  })

  it("closes the direct connection only after it has released the document's mutex, so the two never wait for each other", async () => {
    // No store of its own is due while this runs, so a locked mutex at the moment of closing could only be the restore's.
    world = await startWorld({ debounceMs: 60_000 })
    const hocuspocus = world.collab.server.hocuspocus
    const open = hocuspocus.openDirectConnection.bind(hocuspocus)
    const lockedWhenClosed: boolean[] = []
    vi.spyOn(hocuspocus, 'openDirectConnection').mockImplementation(async (name, context) => {
      const connection = await open(name, context)
      const document = connection.document
      const disconnect = connection.disconnect.bind(connection)
      connection.disconnect = async (options) => {
        lockedWhenClosed.push(document?.saveMutex.isLocked() ?? true)
        await disconnect(options)
      }
      return connection
    })
    const documentId = await freshDocument('Current')

    const response = await restore(await versionOf(documentId, 'Old'))

    expect(response.statusCode).toBe(200)
    expect(lockedWhenClosed).toEqual([false])
  })

  it('does not add a second restore version or event when the database is asked to commit the same restore again', async () => {
    let answerLost = true
    world = await startWorld({
      versions: (real) => ({
        ...real,
        async commit(restored) {
          const versionId = await real.commit(restored)
          // The write committed and its answer never arrived: the restore asks again.
          if (answerLost) {
            answerLost = false
            throw new Error('The answer was lost')
          }
          return versionId
        },
      }),
    })
    const documentId = await freshDocument('Current')

    const response = await restore(await versionOf(documentId, 'Old'))

    expect(response.statusCode).toBe(200)
    expect(await kindsOf(documentId)).toEqual(['manual', 'pre-restore', 'restore'])
    expect(await eventsOf(documentId)).toEqual([{ type: 'version.restored', actor_id: owner.id }])
    const [, , written] = await versionsOf(db, documentId)
    expect(written?.id).toBe(bodyAs<Version>(response).id)
  })

  it('fails when the database keeps refusing the commit, after trying again, and the store still persists the restored content', async () => {
    let commits = 0
    world = await startWorld({
      versions: (real) => ({
        ...real,
        commit() {
          commits += 1
          return Promise.reject(new Error('The database refused the write'))
        },
      }),
    })
    const documentId = await freshDocument('Current')

    const response = await restore(await versionOf(documentId, 'Old'))

    expect(response.statusCode).toBe(500)
    expect(commits).toBe(RESTORE_COMMIT_ATTEMPTS)
    // What was replaced is kept, there is no result version, and nobody is told about a restore that did not finish.
    expect(await kindsOf(documentId)).toEqual(['manual', 'pre-restore'])
    expect([await eventsOf(documentId), world.told]).toEqual([[], []])
    expect(
      await eventually(async () => {
        const stored = await storedParagraphs(db, documentId)
        return stored.includes('Old') ? stored : undefined
      }, 'the store to persist the restored content'),
    ).toEqual(['Old'])
  })

  it('ends with the version unreadable before it has opened the document or kept anything', async () => {
    world = await startWorld()
    const opened = vi.spyOn(world.collab.server.hocuspocus, 'openDirectConnection')
    const documentId = await freshDocument('Current')
    const unreadable = new Y.Doc()
    forbiddenContent[0]?.[1](unreadable)
    const versionId = await createVersion(db, {
      workspaceId,
      documentId,
      author: owner,
      state: Y.encodeStateAsUpdate(unreadable),
    })

    const response = await restore(versionId)

    expect(response.statusCode).toBe(500)
    expect(opened).not.toHaveBeenCalled()
    expect(await kindsOf(documentId)).toEqual(['manual'])
    expect(await storedParagraphs(db, documentId)).toEqual(['Current'])
  })
})

describe('who may restore', () => {
  it('refuses an editor with a 403 over REST, and changes nothing', async () => {
    world = await startWorld()
    const documentId = await freshDocument('Current')
    const versionId = await versionOf(documentId, 'Old')

    const response = await restore(versionId, editorA)

    expect(response.statusCode).toBe(403)
    expect(await storedParagraphs(db, documentId)).toEqual(['Current'])
    expect([await kindsOf(documentId), await eventsOf(documentId), world.told]).toEqual([['manual'], [], []])
  })
})
