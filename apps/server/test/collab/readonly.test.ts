import { documentName } from '@draftroom/contract/collab'
import type { Kysely } from 'kysely'
import * as Y from 'yjs'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import { appendParagraph, documentWith, paragraphsOfDoc, storedParagraphs } from '../support/collab/content.ts'
import { outgoing } from '../support/collab/frames.ts'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { ClientSet } from '../support/collab/provider-client.ts'
import { RawClient } from '../support/collab/raw-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from '../support/world.ts'

// A person who may only read must not be able to write, whatever the client they use does (protocol §4). Nothing here
// looks at the name of a flag: the forged update is sent as a hostile client would send it, and what is looked at is
// whether it changed anything, for anyone, anywhere.

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
  readonly commenter: Person
}

let people: People
beforeAll(async () => {
  const workspaceId = await createWorkspace(db)
  const [owner, editor, viewer, commenter] = await Promise.all(
    ['Marta Ruiz', 'Eli Vega', 'Vera Lund', 'Carmen Sol'].map((name) => createPerson(db, name)),
  )
  if (!owner || !editor || !viewer || !commenter) throw new Error('A person is missing')
  await join(db, workspaceId, owner, 'owner')
  for (const person of [editor, viewer, commenter]) await join(db, workspaceId, person)
  people = { workspaceId, owner, editor, viewer, commenter }
})

/** A document of its own, so that what one test writes is not in the next one's. */
async function newDocument(): Promise<string> {
  const { workspaceId, owner, editor, viewer, commenter } = people
  const documentId = await createDocument(db, { workspaceId, creator: owner })
  await grant(db, { workspaceId, documentId, person: editor, role: 'editor' })
  await grant(db, { workspaceId, documentId, person: viewer, role: 'viewer' })
  await grant(db, { workspaceId, documentId, person: commenter, role: 'commenter' })
  return documentId
}

/** What a hostile client builds on its own: a document with a paragraph nobody typed, as an update. */
const forgedUpdate = (): Uint8Array => Y.encodeStateAsUpdate(documentWith('FORGED'))

/** The live document the server holds in memory. */
function liveDocument(documentId: string): Y.Doc {
  const live = collab.server.hocuspocus.documents.get(documentName(documentId))
  if (live === undefined) throw new Error('The document is not loaded')
  return live
}

describe.each([
  ['a viewer', () => people.viewer],
  ['a commenter', () => people.commenter],
])('%s who sends an update they made by hand', (_description, reader) => {
  // The two messages that carry content: an update, and the SyncStep2 that answers the server's handshake.
  const channels = [
    ['an update', outgoing.update],
    ['a SyncStep2', outgoing.syncStep2],
  ] as const

  it.each(channels)('as %s changes nothing: not applied, not stored and not broadcast', async (_channel, frame) => {
    const documentId = await newDocument()
    const editor = clients.open(documentId, { email: people.editor.email })
    const witness = clients.open(documentId, { email: people.owner.email })
    await Promise.all([editor.waitForSynced(), witness.waitForSynced()])
    const applied: Uint8Array[] = []
    liveDocument(documentId).on('update', (update: Uint8Array) => applied.push(update))

    const hostile = await RawClient.connect(collab.url, { email: reader().email })
    hostile.authenticate(documentId)
    await hostile.waitFor('authenticated')
    hostile.send(frame(documentName(documentId), forgedUpdate()))
    // A connection's messages are answered in order, so this answer means the forged one has been dealt with.
    expect((await hostile.waitFor('sync-status')).saved).toBe(false)

    // The editor writes after it: once that is stored and has reached the witness, anything the forged update was going
    // to do to the document, the database or the other people would have been done.
    const typed = editor.edit((doc) => appendParagraph(doc, 'legitimate'))
    await editor.waitForStoredCovering(typed)
    await witness.waitForDoc('the legitimate paragraph', (doc) => paragraphsOfDoc(doc).includes('legitimate'))

    expect(applied).toHaveLength(1)
    expect(paragraphsOfDoc(liveDocument(documentId))).toEqual(['legitimate'])
    expect(await storedParagraphs(db, documentId)).toEqual(['legitimate'])
    expect(paragraphsOfDoc(witness.doc)).toEqual(['legitimate'])
    hostile.terminate()
  })
})

describe('an editor, as the control of the above', () => {
  it('has the same update applied, stored and broadcast', async () => {
    const documentId = await newDocument()
    const editor = clients.open(documentId, { email: people.editor.email })
    const witness = clients.open(documentId, { email: people.owner.email })
    await Promise.all([editor.waitForSynced(), witness.waitForSynced()])

    const typed = editor.edit((doc) => appendParagraph(doc, 'typed by an editor'))
    await editor.waitForStoredCovering(typed)
    await witness.waitForDoc('the paragraph', (doc) => paragraphsOfDoc(doc).includes('typed by an editor'))

    expect(await storedParagraphs(db, documentId)).toEqual(['typed by an editor'])
  })
})
