import { documentName, serializeStatelessEvent } from '@draftroom/contract/collab'
import type { Kysely } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import * as Y from 'yjs'
import { appendParagraph, documentWith } from '../support/collab/content.ts'
import { outgoing } from '../support/collab/frames.ts'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { ClientSet } from '../support/collab/provider-client.ts'
import { RawClient } from '../support/collab/raw-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createDocument, createPerson, createWorkspace, join, type Person } from '../support/world.ts'

// Clients never send stateless messages (protocol §5.4): comments and metadata go through REST, and `stored` is the
// server's to say. A client that sends one must not be able to tell the others that a change was stored.

let database: TestDatabase
let db: Kysely<Database>
let collab: CollabHarness
let clients: ClientSet
let socket: RawClient | undefined
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  collab = await startCollab(db)
  clients = new ClientSet(collab.url)
})
afterEach(() => {
  clients.destroyAll()
  socket?.terminate()
})
afterAll(async () => {
  await collab.close()
  await database.drop()
})

let owner: Person
let documentId: string
beforeAll(async () => {
  const workspaceId = await createWorkspace(db)
  owner = await createPerson(db, 'Marta Ruiz')
  await join(db, workspaceId, owner, 'owner')
  documentId = await createDocument(db, { workspaceId, creator: owner })
})

describe('a stateless message from a client', () => {
  it('is ignored: it is not relayed to anyone, and the connection that sent it stays open', async () => {
    const witness = clients.open(documentId, { email: owner.email })
    await witness.waitForSynced()
    socket = await RawClient.connect(collab.url, { email: owner.email })
    await socket.join(documentId)

    // A claim that a change nobody made is stored, which the witness would believe if it were relayed.
    const claim = Buffer.from(Y.encodeSnapshot(Y.snapshot(documentWith('claimed as stored')))).toString('base64')
    socket.send(
      outgoing.stateless(documentName(documentId), serializeStatelessEvent({ type: 'stored', snapshot: claim })),
    )
    const mark = socket.mark
    socket.send(outgoing.syncStep1(documentName(documentId), new Uint8Array([0])))
    await socket.waitFor('sync', () => true, mark)
    const typed = witness.edit((doc) => appendParagraph(doc, 'a real change'))
    await witness.waitForStoredCovering(typed)

    // The two it was told: what is stored when it connected, and what the server stored after its own change.
    expect(witness.storedEvents).toHaveLength(2)
    expect(witness.storedEvents.map(({ snapshot }) => snapshot)).not.toContain(claim)
    expect(socket.isOpen).toBe(true)
  })
})
