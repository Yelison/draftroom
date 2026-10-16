import {
  MAX_DOCUMENT_STATE_BYTES,
  MAX_MESSAGE_BYTES,
  MESSAGE_RATE_LIMIT_BURST,
  documentName,
} from '@draftroom/contract/collab'
import type { Kysely } from 'kysely'
import * as Y from 'yjs'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { AuthProvider } from '../../src/http/auth/auth-provider.ts'
import { createDevIdentity } from '../../src/http/auth/devIdentity.ts'
import type { Database } from '../../src/db/tables.ts'
import {
  appendParagraph,
  deleteFirstCharacter,
  documentOfAtLeast,
  paragraphsOfDoc,
  storeState,
} from '../support/collab/content.ts'
import { outgoing } from '../support/collab/frames.ts'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { ClientSet } from '../support/collab/provider-client.ts'
import { RawClient } from '../support/collab/raw-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from '../support/world.ts'

// The limits of protocol §5.1 and §5.2, and the close codes they end with (§6).

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
  readonly commenter: Person
  readonly viewer: Person
}

let people: People
beforeAll(async () => {
  const workspaceId = await createWorkspace(db)
  const [owner, editor, commenter, viewer] = await Promise.all(
    ['Marta Ruiz', 'Eli Vega', 'Carmen Sol', 'Vera Lund'].map((name) => createPerson(db, name)),
  )
  if (!owner || !editor || !commenter || !viewer) throw new Error('A person is missing')
  await join(db, workspaceId, owner, 'owner')
  for (const person of [editor, commenter, viewer]) await join(db, workspaceId, person)
  people = { workspaceId, owner, editor, commenter, viewer }
})

async function newDocument(): Promise<string> {
  const { workspaceId, owner, editor, commenter, viewer } = people
  const documentId = await createDocument(db, { workspaceId, creator: owner })
  await grant(db, { workspaceId, documentId, person: editor, role: 'editor' })
  await grant(db, { workspaceId, documentId, person: commenter, role: 'commenter' })
  await grant(db, { workspaceId, documentId, person: viewer, role: 'viewer' })
  return documentId
}

describe('a message above the size of one message', () => {
  it('closes the socket with 1009, which is the transport refusing it and not a code of the server', async () => {
    const documentId = await newDocument()
    const socket = await RawClient.connect(collab.url, { email: people.editor.email })
    socket.authenticate(documentId)
    await socket.waitFor('authenticated')

    socket.send(outgoing.update(documentName(documentId), new Uint8Array(MAX_MESSAGE_BYTES + 1)))

    expect((await socket.waitForClose()).code).toBe(1009)
  })
})

// Each of these loads a state of 5 MiB into a server and a client: about two seconds on a loaded machine, so the bound of a
// failure is wider than the 5 s of a test.
describe('a document above the size of a document', { timeout: 30_000 }, () => {
  let heavy: Uint8Array
  beforeAll(() => {
    heavy = Y.encodeStateAsUpdate(documentOfAtLeast(MAX_DOCUMENT_STATE_BYTES + 1))
  })

  async function heavyDocument(): Promise<string> {
    const documentId = await newDocument()
    await storeState(db, documentId, heavy)
    return documentId
  }

  it('is above the limit, as the tests below assume', () => {
    expect(heavy.byteLength).toBeGreaterThan(MAX_DOCUMENT_STATE_BYTES)
  })

  // Every client answers the server's SyncStep1 with a SyncStep2, even when it has nothing to send: that adds nothing, so
  // opening and reading works for everyone.
  const readers = [
    ['an editor with no changes', 'editor', 'read-write'],
    ['a commenter', 'commenter', 'readonly'],
    ['a viewer', 'viewer', 'readonly'],
  ] as const

  it.each(readers)('can be opened and read by %s', async (_description, who, scope) => {
    const reader = clients.open(await heavyDocument(), { email: people[who].email })

    expect(await reader.waitForScope()).toBe(scope)
    await reader.waitForSynced()
    expect(paragraphsOfDoc(reader.doc)).toHaveLength(heavyParagraphCount())
    expect(reader.closes).toEqual([])
  })

  const heavyParagraphCount = () => {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, heavy)
    return paragraphsOfDoc(doc).length
  }

  it('applies an update that only deletes: the way down from a document that is too large', async () => {
    const documentId = await heavyDocument()
    const editor = clients.open(documentId, { email: people.editor.email })
    const witness = clients.open(documentId, { email: people.viewer.email })
    await Promise.all([editor.waitForSynced(), witness.waitForSynced()])
    const firstBefore = paragraphsOfDoc(witness.doc)[0]

    editor.edit(deleteFirstCharacter)
    await witness.waitForDoc('the deletion', (doc) => paragraphsOfDoc(doc)[0] !== firstBefore)

    expect(paragraphsOfDoc(witness.doc)[0]).toBe(firstBefore?.slice(1))
    expect(editor.closes).toEqual([])
  })

  it('refuses an update that adds content with document-too-large and 4413, and leaves the others reading', async () => {
    const documentId = await heavyDocument()
    const editor = clients.open(documentId, { email: people.editor.email })
    const witness = clients.open(documentId, { email: people.viewer.email })
    await Promise.all([editor.waitForSynced(), witness.waitForSynced()])

    editor.edit((doc) => appendParagraph(doc, 'one more paragraph'))

    await editor.waitForEvent('document-too-large')
    expect((await editor.waitForClose()).code).toBe(4413)
    expect(paragraphsOfDoc(witness.doc)).not.toContain('one more paragraph')
    expect(witness.closes).toEqual([])
  })
})

// The server answers a SyncStep1 with a SyncStep2 and then its own SyncStep1: two frames, which is how a test counts the
// messages it has dealt with.
const FRAMES_PER_HANDSHAKE_MESSAGE = 2

describe('the rate of messages', () => {
  it('closes the connection with 4429 on the message after the burst, and does not process that message', async () => {
    // A clock that does not move: no token is added back, so the bucket holds exactly the burst.
    const frozen = await startCollab(db, { now: () => 0 })
    try {
      const documentId = await newDocument()
      const name = documentName(documentId)
      const socket = await RawClient.connect(frozen.url, { email: people.editor.email })
      await socket.join(documentId)
      const mark = socket.mark
      // `join` used one token. The rest of the burst but one is spent on an empty presence update, which the server answers
      // with nothing: the test waits for no reply, and what a busy machine takes to answer 200 handshakes is not what is measured.
      const spent = 1
      for (let sent = spent; sent < MESSAGE_RATE_LIMIT_BURST - 1; sent += 1) socket.send(outgoing.awareness(name, []))
      // The last token of the burst goes to a message that is answered, which shows it was let through.
      socket.send(outgoing.syncStep1(name, new Uint8Array([0])))
      await socket.waitForFrames('sync', FRAMES_PER_HANDSHAKE_MESSAGE, mark)
      expect(socket.isOpen).toBe(true)

      socket.send(outgoing.syncStep1(name, new Uint8Array([0])))

      const closed = await socket.waitForClose()
      expect(closed).toEqual({ code: 4429, reason: 'rate-limited' })
      expect(socket.framesOf('sync', mark)).toBe(FRAMES_PER_HANDSHAKE_MESSAGE)
    } finally {
      await frozen.close()
    }
    // Nothing here depends on time, but a worker of a loaded machine can take longer than the 5 s of a test to start a
    // server and a connection: this is the bound of a failure, not a wait.
  }, 30_000)
})

describe('what is sent before authentication finishes', () => {
  it('closes the connection with 4205 when more messages are buffered than the limit allows', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const real = createDevIdentity(db)
    // An identity that answers late, as a slow database does: everything the client sends meanwhile is buffered.
    const slow: AuthProvider = {
      authenticate: async (request, requirement) => {
        await gate
        return real.authenticate(request, requirement)
      },
    }
    const slowCollab = await startCollab(db, { authProvider: slow })
    try {
      const documentId = await newDocument()
      const name = documentName(documentId)
      const socket = await RawClient.connect(slowCollab.url, { email: people.editor.email })
      socket.authenticate(documentId)

      // The limit is 64 messages: the 65th is one too many.
      for (let sent = 0; sent < 65; sent += 1) socket.send(outgoing.syncStep1(name, new Uint8Array([0])))

      expect((await socket.waitForClose()).code).toBe(4205)
    } finally {
      release?.()
      await slowCollab.close()
    }
  })
})
