import type { Kysely } from 'kysely'
import * as Y from 'yjs'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import {
  appendParagraph,
  deleteFirstCharacter,
  documentWith,
  paragraphsOfDoc,
  storedParagraphs,
  storeState,
} from '../support/collab/content.ts'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { ClientSet } from '../support/collab/provider-client.ts'
import { RawClient } from '../support/collab/raw-client.ts'
import { outgoing } from '../support/collab/frames.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from '../support/world.ts'
import { documentName } from '@draftroom/contract/collab'

// "Synced" means the server stored the change (protocol §7, ADR 0006): the `stored` event carries a snapshot, and a
// client may call a change stored only if that snapshot contains it.

let database: TestDatabase
let db: Kysely<Database>
let collab: CollabHarness
let clients: ClientSet
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  collab = await startCollab(db)
  clients = new ClientSet(collab.url)
})
afterEach(() => clients.destroyAll())
afterAll(async () => {
  await collab.close()
  await database.drop()
})

interface People {
  readonly workspaceId: string
  readonly owner: Person
  readonly editor: Person
  readonly viewer: Person
}

let people: People
beforeAll(async () => {
  const workspaceId = await createWorkspace(db)
  const [owner, editor, viewer] = await Promise.all(
    ['Marta Ruiz', 'Eli Vega', 'Vera Lund'].map((name) => createPerson(db, name)),
  )
  if (!owner || !editor || !viewer) throw new Error('A person is missing')
  await join(db, workspaceId, owner, 'owner')
  for (const person of [editor, viewer]) await join(db, workspaceId, person)
  people = { workspaceId, owner, editor, viewer }
})

/** A document of its own, optionally with content already stored, as one that people worked on earlier. */
async function newDocument(stored: readonly string[] = []): Promise<string> {
  const { workspaceId, owner, editor, viewer } = people
  const documentId = await createDocument(db, { workspaceId, creator: owner })
  await grant(db, { workspaceId, documentId, person: editor, role: 'editor' })
  await grant(db, { workspaceId, documentId, person: viewer, role: 'viewer' })
  if (stored.length > 0) await storeState(db, documentId, Y.encodeStateAsUpdate(documentWith(...stored)))
  return documentId
}

describe('an update from an editor', () => {
  it('is stored, and followed by a stored event whose snapshot contains it', async () => {
    const documentId = await newDocument()
    const editor = clients.open(documentId, { email: people.editor.email })
    await editor.waitForSynced()

    const typed = editor.edit((doc) => appendParagraph(doc, 'Opening line'))
    const event = await editor.waitForStoredCovering(typed)

    expect(Y.snapshotContainsUpdate(Y.decodeSnapshot(Buffer.from(event.snapshot, 'base64')), typed)).toBe(true)
    // The event is sent after the write committed, so the database already has what it says.
    expect(await storedParagraphs(db, documentId)).toEqual(['Opening line'])
  })

  it('that only deletes is covered by a snapshot taken after it, and not by the one taken before', async () => {
    const documentId = await newDocument(['hello'])
    const editor = clients.open(documentId, { email: people.editor.email })
    await editor.waitForSynced()
    // What the server says is stored when the editor connects: the state it loaded, which still has the whole word.
    const before = await editor.waitForStored()

    const deleted = editor.edit(deleteFirstCharacter)
    const after = await editor.waitForStoredCovering(deleted)

    // A deletion adds no struct, so a state vector could not have told these two apart: the snapshot, with its delete set, does.
    expect(Y.snapshotContainsUpdate(Y.decodeSnapshot(Buffer.from(before.snapshot, 'base64')), deleted)).toBe(false)
    expect(after.snapshot).not.toBe(before.snapshot)
    expect(await storedParagraphs(db, documentId)).toEqual(['ello'])
  })

  it('is never announced as stored to someone who only reads', async () => {
    const documentId = await newDocument()
    const editor = clients.open(documentId, { email: people.editor.email })
    await editor.waitForSynced()
    const reader = await RawClient.connect(collab.url, { email: people.viewer.email })
    reader.authenticate(documentId)
    await reader.waitFor('authenticated')

    const typed = editor.edit((doc) => appendParagraph(doc, 'for the readers'))
    await editor.waitForStoredCovering(typed)
    // What the server sent to the reader before this answer is everything it was going to send for that store.
    const mark = reader.mark
    reader.send(outgoing.syncStep1(documentName(documentId), new Uint8Array([0])))
    await reader.waitFor('sync', () => true, mark)

    expect(reader.received.filter((frame) => frame.kind === 'stateless')).toEqual([])
    reader.terminate()
  })
})

describe('a client that opens a document with nothing new to send', () => {
  it('is told what is stored, so that it does not wait for a store that will never happen', async () => {
    const documentId = await newDocument(['already there'])

    const reopened = clients.open(documentId, { email: people.editor.email })
    const event = await reopened.waitForStored()
    await reopened.waitForSynced()

    // The loaded state is stored by definition: the snapshot covers everything the client has.
    const everything = Y.encodeStateAsUpdate(reopened.doc)
    expect(Y.snapshotContainsUpdate(Y.decodeSnapshot(Buffer.from(event.snapshot, 'base64')), everything)).toBe(true)
  })
})

describe('a restart of the server', () => {
  it('loads the binary state that was stored, with the history of its Yjs document', async () => {
    const documentId = await newDocument()
    const first = await startCollab(db)
    const writer = new ClientSet(first.url).open(documentId, { email: people.editor.email })
    await writer.waitForSynced()
    const typed = writer.edit((doc) => appendParagraph(doc, 'written before the restart'))
    await writer.waitForStoredCovering(typed)
    writer.destroy()
    await first.close()

    const second = await startCollab(db)
    const reader = new ClientSet(second.url).open(documentId, { email: people.viewer.email })
    await reader.waitForSynced()

    expect(paragraphsOfDoc(reader.doc)).toEqual(['written before the restart'])
    // The same Yjs history, not the same content built again: a document rebuilt from JSON would have other client ids.
    expect(Buffer.from(Y.encodeStateVector(reader.doc))).toEqual(Buffer.from(Y.encodeStateVector(writer.doc)))
    reader.destroy()
    await second.close()
  })
})
