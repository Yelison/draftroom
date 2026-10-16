import { documentName } from '@draftroom/contract/collab'
import type { Kysely } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import { outgoing } from '../support/collab/frames.ts'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { RawClient } from '../support/collab/raw-client.ts'
import { settled } from '../support/collab/waiter.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createDocument, createPerson, createWorkspace, join, type Person } from '../support/world.ts'

// A message the server cannot process ends the document connection in band and leaves the socket open (protocol F6 and
// F8). The server does not use that on purpose, but the client rule of §6.5 answers it, so it is pinned here.

let database: TestDatabase
let db: Kysely<Database>
let collab: CollabHarness
let socket: RawClient | undefined
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  collab = await startCollab(db)
})
afterEach(() => socket?.terminate())
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

describe('a hook that throws', () => {
  // The opcode the server uses between its own instances: a client that sends it makes the server throw.
  it('ends the document connection with a message in band, and the socket stays open', async () => {
    socket = await RawClient.connect(collab.url, { email: owner.email })
    await socket.join(documentId)

    socket.send(outgoing.broadcastStateless(documentName(documentId), '{}'))

    const told = await socket.waitFor('closed-in-band')
    await settled()
    expect(told.reason.length).toBeGreaterThan(0)
    expect(socket.isOpen).toBe(true)
  })
})
