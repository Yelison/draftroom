import { documentName } from '@draftroom/contract/collab'
import type { Kysely } from 'kysely'
import * as Y from 'yjs'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createPostgresStateStore } from '../../src/collab/stateStore.ts'
import type { Database } from '../../src/db/tables.ts'
import { appendParagraph, paragraphsOf, storedParagraphs } from '../support/collab/content.ts'
import { forbiddenContent, marker } from '../support/collab/forbidden-content.ts'
import { outgoing } from '../support/collab/frames.ts'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { ObservedStore } from '../support/collab/observed-store.ts'
import { ClientSet } from '../support/collab/provider-client.ts'
import { RawClient } from '../support/collab/raw-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createDocument, createPerson, createWorkspace, join, type Person } from '../support/world.ts'

// Content the schema forbids must never reach the stored state (protocol §2, ADR 0011). The hostile client here is an
// editor, the only role that writes; what is looked at is every state the database was ever given.

let database: TestDatabase
let db: Kysely<Database>
let collab: CollabHarness
let store: ObservedStore
let clients: ClientSet
let sockets: RawClient[] = []
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  store = new ObservedStore(createPostgresStateStore(db))
  collab = await startCollab(db, { store })
  clients = new ClientSet(collab.url)
})
afterEach(() => {
  clients.destroyAll()
  for (const socket of sockets) socket.terminate()
  sockets = []
})
afterAll(async () => {
  await collab.close()
  await database.drop()
})

let owner: Person
let workspaceId: string
beforeAll(async () => {
  workspaceId = await createWorkspace(db)
  owner = await createPerson(db, 'Marta Ruiz')
  await join(db, workspaceId, owner, 'owner')
})

describe.each(forbiddenContent)('an update with %s', (_description, build) => {
  it('is never stored, and the content around it is', async () => {
    const documentId = await createDocument(db, { workspaceId, creator: owner })
    const editor = clients.open(documentId, { email: owner.email })
    const witness = clients.open(documentId, { email: owner.email })
    await Promise.all([editor.waitForSynced(), witness.waitForSynced()])
    const writesBefore = store.written.length

    // The update carries a good paragraph and the forbidden block, as a paste would.
    const hostile = new Y.Doc()
    appendParagraph(hostile, 'sent with it')
    build(hostile)
    const attacker = await RawClient.connect(collab.url, { email: owner.email })
    sockets.push(attacker)
    await attacker.join(documentId)
    attacker.send(outgoing.update(documentName(documentId), Y.encodeStateAsUpdate(hostile)))
    // The editor writes after it, so that a store happens after the forbidden update was applied.
    const typed = editor.edit((doc) => appendParagraph(doc, 'written after'))
    await editor.waitForStoredCovering(typed)
    await witness.waitForDoc(
      'the forbidden block to be gone',
      (doc) => !doc.getXmlFragment('default').toString().includes(marker),
    )

    // Every state written since, not just the last: the content must not have been stored even for a moment.
    const written = store.written.slice(writesBefore)
    expect(written.length).toBeGreaterThan(0)
    for (const state of written) expect(Buffer.from(state).toString('utf8')).not.toContain(marker)
    expect(await storedParagraphs(db, documentId)).toEqual(expect.arrayContaining(['sent with it', 'written after']))
    expect(paragraphsOf(Y.encodeStateAsUpdate(witness.doc))).toEqual(
      expect.arrayContaining(['sent with it', 'written after']),
    )
    expect(
      collab.log.entries.some(({ level, message }) => level === 'warn' && message.includes('does not allow')),
    ).toBe(true)
  })
})

describe('content the schema allows', () => {
  it('is stored as it was written, with nothing removed and nothing reported', async () => {
    const documentId = await createDocument(db, { workspaceId, creator: owner })
    const editor = clients.open(documentId, { email: owner.email })
    await editor.waitForSynced()
    const reports = collab.log.entries.length

    const typed = editor.edit((doc) => {
      appendParagraph(doc, 'first')
      appendParagraph(doc, 'second')
    })
    await editor.waitForStoredCovering(typed)

    expect(await storedParagraphs(db, documentId)).toEqual(['first', 'second'])
    expect(collab.log.entries.slice(reports)).toEqual([])
  })
})
