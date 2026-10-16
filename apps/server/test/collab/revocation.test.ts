import { documentName, parseStatelessEvent, type CloseCodeName, type StatelessEvent } from '@draftroom/contract/collab'
import type { Connection } from '@hocuspocus/server'
import type { Kysely } from 'kysely'
import * as Y from 'yjs'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { ConnectionContext } from '../../src/collab/context.ts'
import type { Database } from '../../src/db/tables.ts'
import { documentWith, storedParagraphs } from '../support/collab/content.ts'
import { outgoing } from '../support/collab/frames.ts'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { RawClient } from '../support/collab/raw-client.ts'
import { settled } from '../support/collab/waiter.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from '../support/world.ts'

// How the server ends a live connection (protocol §6.3), as the code of access revocation (T4.1) and of the end of a
// session (T7.1) will call it. Those tasks decide who is closed; what is tested here is what closing one does.

let database: TestDatabase
let db: Kysely<Database>
let collab: CollabHarness
let sockets: RawClient[] = []
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  collab = await startCollab(db)
})
afterEach(() => {
  for (const socket of sockets) socket.terminate()
  sockets = []
})
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

async function newDocument(): Promise<string> {
  const { workspaceId, owner, editor, viewer } = people
  const documentId = await createDocument(db, { workspaceId, creator: owner })
  await grant(db, { workspaceId, documentId, person: editor, role: 'editor' })
  await grant(db, { workspaceId, documentId, person: viewer, role: 'viewer' })
  return documentId
}

/** A person connected to a document, authenticated and waiting. */
async function connect(documentId: string, person: Person): Promise<RawClient> {
  const socket = await RawClient.connect(collab.url, { email: person.email })
  sockets.push(socket)
  await socket.join(documentId)
  return socket
}

function liveConnections(documentId: string): Connection<ConnectionContext>[] {
  const live = collab.server.hocuspocus.documents.get(documentName(documentId))
  return live === undefined ? [] : (live.getConnections() as Connection<ConnectionContext>[])
}

describe('ending a connection', () => {
  // Rows: what changed, the plan the caller gives, and what the client must see. The event goes first: `ws` delivers
  // frames in order, so it arrives before the close.
  const rows: readonly (readonly [string, CloseCodeName, StatelessEvent | undefined])[] = [
    ['access removed', 'access-revoked', { type: 'access-changed' }],
    ['the role changed and the mode flips', 'role-changed', { type: 'access-changed' }],
    ['the document archived, for someone who can no longer read it', 'access-revoked', { type: 'document-archived' }],
    ['the document archived, for an owner whose connection is recycled', 'role-changed', { type: 'document-archived' }],
    ['the document deleted for good', 'access-revoked', undefined],
    ['the session ended', 'unauthenticated', undefined],
  ]

  it.each(rows)(
    '%s: the event if there is one, then the socket closed with the code and its name',
    async (_change, code, event) => {
      const documentId = await newDocument()
      const socket = await connect(documentId, people.editor)

      const ended = collab.server.endConnections({ documentId }, { code, ...(event === undefined ? {} : { event }) })

      const closed = await socket.waitForClose()
      expect(ended).toBe(1)
      expect(closed.reason).toBe(code)
      expect(closed.code).toBe({ 'access-revoked': 4403, 'role-changed': 4409, unauthenticated: 4401 }[code as string])
      // The editor was also told what is stored when it connected; what is looked at is what the close was explained by.
      const explained = socket.received
        .flatMap((frame) => (frame.kind === 'stateless' ? [parseStatelessEvent(frame.payload)] : []))
        .filter((told) => told?.type !== 'stored')
      expect(explained).toEqual(event === undefined ? [] : [event])
    },
  )

  it('sets the connection read-only before it closes the socket, so an update sent in between is not applied', async () => {
    const documentId = await newDocument()
    const name = documentName(documentId)
    const socket = await connect(documentId, people.editor)
    const [connection] = liveConnections(documentId)
    if (connection === undefined) throw new Error('The connection is not live')
    const applied: Uint8Array[] = []
    collab.server.hocuspocus.documents.get(name)?.on('update', (update: Uint8Array) => applied.push(update))
    const closeSocket = connection.webSocket.close.bind(connection.webSocket)
    let readOnlyWhenClosing: boolean | undefined
    connection.webSocket.close = (code, reason) => {
      readOnlyWhenClosing = connection.readOnly
      // The instant between flipping the flag and the close frame leaving: an update that arrives now would be applied
      // by a connection that can still write.
      connection.handleMessage(outgoing.update(name, Y.encodeStateAsUpdate(documentWith('written while closing'))))
      closeSocket(code, reason)
    }

    collab.server.endConnections({ documentId }, { code: 'access-revoked' })
    await socket.waitForClose()
    await settled()

    expect(readOnlyWhenClosing).toBe(true)
    expect(applied).toEqual([])
    expect(await storedParagraphs(db, documentId)).toEqual([])
  })
})

describe('choosing the connections to end', () => {
  it('ends only those that match every condition given, and says how many', async () => {
    const first = await newDocument()
    const second = await newDocument()
    const editorOnFirst = await connect(first, people.editor)
    const viewerOnFirst = await connect(first, people.viewer)
    const editorOnSecond = await connect(second, people.editor)

    const ended = collab.server.endConnections(
      { documentId: first, userId: people.editor.id },
      { code: 'access-revoked' },
    )

    expect(ended).toBe(1)
    expect((await editorOnFirst.waitForClose()).code).toBe(4403)
    expect([viewerOnFirst.isOpen, editorOnSecond.isOpen]).toEqual([true, true])
  })

  it('ends every connection of a person on every document, when only the person is given', async () => {
    const first = await newDocument()
    const second = await newDocument()
    const onFirst = await connect(first, people.editor)
    const onSecond = await connect(second, people.editor)
    const other = await connect(first, people.viewer)

    const ended = collab.server.endConnections({ userId: people.editor.id }, { code: 'access-revoked' })

    expect(ended).toBe(2)
    await Promise.all([onFirst.waitForClose(), onSecond.waitForClose()])
    expect(other.isOpen).toBe(true)
  })

  it('can split the people of a document by what is known of their connection, as an archive does the owners and the rest', async () => {
    const documentId = await newDocument()
    const owner = await connect(documentId, people.owner)
    const editor = await connect(documentId, people.editor)

    const recycled = collab.server.endConnections(
      { documentId, where: ({ role }) => role === 'owner' },
      { code: 'role-changed', event: { type: 'document-archived' } },
    )
    const revoked = collab.server.endConnections(
      { documentId, where: ({ role }) => role !== 'owner' },
      { code: 'access-revoked', event: { type: 'document-archived' } },
    )

    expect([recycled, revoked]).toEqual([1, 1])
    expect([(await owner.waitForClose()).code, (await editor.waitForClose()).code]).toEqual([4409, 4403])
  })

  it('refuses to end connections without a condition, so nobody closes every connection by accident', () => {
    expect(() => collab.server.endConnections({}, { code: 'access-revoked' })).toThrow(RangeError)
  })
})
