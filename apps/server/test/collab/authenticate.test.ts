import { randomUUID } from 'node:crypto'
import { documentName } from '@draftroom/contract/collab'
import type { Kysely } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import type { AuthProvider } from '../../src/http/auth/auth-provider.ts'
import { outgoing } from '../support/collab/frames.ts'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { ClientSet } from '../support/collab/provider-client.ts'
import { RawClient } from '../support/collab/raw-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from '../support/world.ts'

// Who may connect to a document, and how (protocol §3.3 and §4). Every refusal happens before any document data is sent.

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

interface Setting {
  readonly owner: Person
  readonly editor: Person
  readonly commenter: Person
  readonly viewer: Person
  /** A member of the workspace with no access to the document. */
  readonly bystander: Person
  /** Owns a workspace of their own and belongs to no other. */
  readonly stranger: Person
  readonly documentId: string
  readonly archivedDocumentId: string
}

let setting: Setting
beforeAll(async () => {
  const workspaceId = await createWorkspace(db)
  const [owner, editor, commenter, viewer, bystander, stranger] = await Promise.all(
    ['Marta Ruiz', 'Eli Vega', 'Carmen Sol', 'Vera Lund', 'Nora Pike', 'Zoe Hartmann'].map((name) =>
      createPerson(db, name),
    ),
  )
  if (!owner || !editor || !commenter || !viewer || !bystander || !stranger) throw new Error('A person is missing')
  await join(db, workspaceId, owner, 'owner')
  for (const person of [editor, commenter, viewer, bystander]) await join(db, workspaceId, person)
  await join(db, await createWorkspace(db, 'Hartmann Studio'), stranger, 'owner')
  const documentId = await createDocument(db, { workspaceId, creator: owner })
  const archivedDocumentId = await createDocument(db, { workspaceId, creator: owner, archived: true })
  await grant(db, { workspaceId, documentId, person: editor, role: 'editor' })
  await grant(db, { workspaceId, documentId, person: commenter, role: 'commenter' })
  await grant(db, { workspaceId, documentId, person: viewer, role: 'viewer' })
  await grant(db, { workspaceId, documentId: archivedDocumentId, person: editor, role: 'editor' })
  setting = { owner, editor, commenter, viewer, bystander, stranger, documentId, archivedDocumentId }
})

const open = (documentId: string, person: Person) => clients.open(documentId, { email: person.email })

describe('the mode a connection gets', () => {
  // Rows: who connects and to which document. The scope is what the provider reports as `authorizedScope`.
  const rows = [
    ['an owner of a live document', 'owner', 'live', 'read-write'],
    ['an editor of a live document', 'editor', 'live', 'read-write'],
    ['a commenter of a live document', 'commenter', 'live', 'readonly'],
    ['a viewer of a live document', 'viewer', 'live', 'readonly'],
    ['an owner of an archived document', 'owner', 'archived', 'readonly'],
  ] as const

  it.each(rows)('gives %s the scope %s', async (_description, who, which, scope) => {
    const documentId = which === 'live' ? setting.documentId : setting.archivedDocumentId

    expect(await open(documentId, setting[who]).waitForScope()).toBe(scope)
  })

  it('does not take the identity from the token a client sends', async () => {
    const socket = await RawClient.connect(collab.url, { email: setting.viewer.email })

    // The token names the owner; the header names a viewer, and the header is what counts.
    socket.send(outgoing.authenticate(documentName(setting.documentId), setting.owner.email))

    expect((await socket.waitFor('authenticated')).scope).toBe('readonly')
    socket.terminate()
  })
})

describe('a connection that is refused', () => {
  it('is told it is not signed in, and is sent no document data', async () => {
    const socket = await RawClient.connect(collab.url)
    socket.authenticate(setting.documentId)

    expect((await socket.waitFor('denied')).reason).toBe('unauthenticated')
    expect(socket.received.map((frame) => frame.kind)).toEqual(['denied'])
    socket.terminate()
  })

  // Every way of not being allowed looks like a document that does not exist, so an id cannot be probed.
  const unreachable = [
    ['a document that does not exist', () => randomUUID(), () => setting.bystander],
    ['a document the person has no role on', () => setting.documentId, () => setting.bystander],
    ['a document of another workspace', () => setting.documentId, () => setting.stranger],
    ['an archived document the person does not own', () => setting.archivedDocumentId, () => setting.editor],
  ] as const

  it.each(unreachable)('is told not-found for %s, with nothing else', async (_description, documentId, person) => {
    const socket = await RawClient.connect(collab.url, { email: person().email })
    socket.authenticate(documentId())

    expect((await socket.waitFor('denied')).reason).toBe('not-found')
    expect(socket.received.map((frame) => frame.kind)).toEqual(['denied'])
    socket.terminate()
  })

  it('answers a name that is not a canonical document name as it answers a missing document', async () => {
    const socket = await RawClient.connect(collab.url, { email: setting.owner.email })
    socket.send(outgoing.authenticate(documentName(setting.documentId).toUpperCase()))

    expect((await socket.waitFor('denied')).reason).toBe('not-found')
    socket.terminate()
  })
})

describe('an authentication that fails for a reason of the server', () => {
  it('is not answered not-found, which a client that had access would take as its access being removed', async () => {
    const broken: AuthProvider = { authenticate: () => Promise.reject(new Error('The session store is down')) }
    const unreliable = await startCollab(db, { authProvider: broken })
    try {
      const failing = new ClientSet(unreliable.url).open(setting.documentId, { email: setting.owner.email })

      const reason = await failing.waitForDenied()
      failing.destroy()

      expect(['unauthenticated', 'not-found']).not.toContain(reason)
    } finally {
      await unreliable.close()
    }
  })
})

describe('the upgrade of the WebSocket', () => {
  const origin = (value: string) => ({ origin: value })

  it.each([
    ['an allowed origin', origin('https://app.harborpine.example'), 101],
    ['another origin', origin('https://evil.example'), 403],
    // The tests and the tools send none; a browser always does.
    ['no origin, in development and tests', {}, 101],
  ])('answers %s with %i', async (_description, headers, status) => {
    expect(await RawClient.tryConnect(collab.url, { email: setting.owner.email, headers })).toBe(status)
  })

  it('refuses a connection with no origin where there is no development identity', async () => {
    const production = await startCollab(db, { config: { devIdentity: false } })
    try {
      expect(await RawClient.tryConnect(production.url, { email: setting.owner.email })).toBe(403)
    } finally {
      await production.close()
    }
  })
})
