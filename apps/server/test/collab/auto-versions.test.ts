import { documentName } from '@draftroom/contract/collab'
import { sql, type Kysely } from 'kysely'
import * as Y from 'yjs'
import { afterEach, describe, expect, it } from 'vitest'
import { createPostgresStateStore, type StateStore } from '../../src/collab/stateStore.ts'
import type { CollabTiming } from '../../src/collab/timing.ts'
import type { Database } from '../../src/db/tables.ts'
import { appendParagraph, documentWith, paragraphsOf, storeState } from '../support/collab/content.ts'
import { fastTiming, startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { ClientSet } from '../support/collab/provider-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createVersion, versionsOf } from '../support/versions.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from '../support/world.ts'

// Automatic versions (protocol §11.2): after ten minutes without an update, when there are edits since the newest version,
// and at most one every thirty minutes, the server makes a version on its own. The clock is the server's own, so every
// case here moves it by hand, and the instants the database holds are written by hand as well.

const minute = 60_000
const stateOf = (...paragraphs: string[]): Uint8Array => Y.encodeStateAsUpdate(documentWith(...paragraphs))

// The sweep looks at every document of the database, so each test gets a database of its own: what an earlier test left
// stored would be versioned by this one.
let database: TestDatabase
let db: Kysely<Database>
let workspaceId: string
let owner: Person
let editor: Person

/** The server's clock, which a test moves: minutes after the moment the test started. */
class FakeClock {
  readonly start = Date.now()
  private elapsed = 0
  readonly now = (): number => this.start + this.elapsed * minute
  /** Moves the clock to this many minutes after the start. */
  at(minutes: number): void {
    this.elapsed = minutes
  }
  /** The instant of this many minutes after the start, as PostgreSQL is given it. */
  iso(minutes: number): string {
    return new Date(this.start + minutes * minute).toISOString()
  }
}

let clock: FakeClock
let collab: CollabHarness
let clients: ClientSet
async function startServer(
  timing: Partial<CollabTiming> = {},
  store?: (real: StateStore) => StateStore,
): Promise<void> {
  database = await provisionDatabase()
  db = database.db
  workspaceId = await createWorkspace(db)
  owner = await createPerson(db, 'Marta Ruiz')
  editor = await createPerson(db, 'Priya Raman')
  await join(db, workspaceId, owner, 'owner')
  await join(db, workspaceId, editor)
  clock = new FakeClock()
  collab = await startCollab(db, {
    now: clock.now,
    timing: { ...fastTiming, ...timing },
    ...(store === undefined ? {} : { store: store(createPostgresStateStore(db)) }),
  })
  clients = new ClientSet(collab.url)
}
afterEach(async () => {
  clients.destroyAll()
  await collab.close()
  await database.drop()
})

/** A document with this content stored, last stored this many minutes after the start. */
async function storedDocument(storedAtMinutes: number, state: Uint8Array): Promise<string> {
  const documentId = await createDocument(db, { workspaceId, creator: owner })
  await grant(db, { workspaceId, documentId, person: editor, role: 'editor' })
  await storeState(db, documentId, state)
  await sql`update document_states set updated_at = ${clock.iso(storedAtMinutes)}::timestamptz where document_id = ${documentId}`.execute(
    db,
  )
  return documentId
}

const eventsOf = (documentId: string) =>
  db.selectFrom('activity_events').select(['type', 'actor_id']).where('document_id', '=', documentId).execute()

const checkedAt = async (documentId: string) =>
  await db
    .selectFrom('document_states')
    .select(['versions_checked_at', 'updated_at'])
    .where('document_id', '=', documentId)
    .executeTakeFirstOrThrow()

describe('a document nobody has open', () => {
  it('gets an automatic version once it has been idle for ten minutes, and not a moment before', async () => {
    await startServer()
    const documentId = await storedDocument(0, stateOf('Draft'))

    clock.at(9.99)
    expect(await collab.server.sweepAutoVersions()).toBe(0)
    clock.at(10)
    expect(await collab.server.sweepAutoVersions()).toBe(1)

    const [version] = await versionsOf(db, documentId)
    expect(version).toMatchObject({ kind: 'auto', created_by: null, label: null })
    expect(paragraphsOf(version?.state ?? new Uint8Array())).toEqual(['Draft'])
    expect(await eventsOf(documentId)).toEqual([{ type: 'version.created', actor_id: null }])
  })

  it('does not make a second version for the same edits, however often it looks', async () => {
    await startServer()
    const documentId = await storedDocument(0, stateOf('Draft'))
    clock.at(11)

    await collab.server.sweepAutoVersions()
    await collab.server.sweepAutoVersions()
    clock.at(120)
    await collab.server.sweepAutoVersions()

    expect(await versionsOf(db, documentId)).toHaveLength(1)
  })

  it('makes none when the newest version already holds what the document holds, and does not look at it again', async () => {
    await startServer()
    const draft = stateOf('Draft')
    const documentId = await storedDocument(0, draft)
    await createVersion(db, {
      workspaceId,
      documentId,
      author: owner,
      state: draft,
      createdAt: clock.iso(5),
    })
    clock.at(15)

    expect(await collab.server.sweepAutoVersions()).toBe(0)

    const { versions_checked_at, updated_at } = await checkedAt(documentId)
    expect(versions_checked_at).toEqual(updated_at)
    expect(await versionsOf(db, documentId)).toHaveLength(1)
  })

  it('looks again once the document is stored again, even if it was looked at before', async () => {
    await startServer()
    const draft = stateOf('Draft')
    const documentId = await storedDocument(0, draft)
    await createVersion(db, {
      workspaceId,
      documentId,
      author: owner,
      state: draft,
      createdAt: clock.iso(5),
    })
    clock.at(15)
    await collab.server.sweepAutoVersions()

    await storeState(db, documentId, stateOf('Draft', 'More'))
    await sql`update document_states set updated_at = ${clock.iso(16)}::timestamptz where document_id = ${documentId}`.execute(
      db,
    )
    clock.at(27)
    await collab.server.sweepAutoVersions()

    const versions = await versionsOf(db, documentId)
    // The hand-made version is dated in the clock of the test and the new one by the database, so they are not in time order.
    expect(versions.map((version) => [version.kind, paragraphsOf(version.state)]).sort()).toEqual([
      ['auto', ['Draft', 'More']],
      ['manual', ['Draft']],
    ])
  })

  it('compares with the empty document when it has no version at all: a document nobody wrote in gets none', async () => {
    await startServer()
    const documentId = await storedDocument(0, stateOf())
    clock.at(60)

    expect(await collab.server.sweepAutoVersions()).toBe(0)
    expect(await versionsOf(db, documentId)).toEqual([])
  })

  it('defers the version to the end of the thirty minutes after the newest automatic one, and makes it then', async () => {
    await startServer()
    const documentId = await storedDocument(40, stateOf('Draft', 'More'))
    await createVersion(db, {
      workspaceId,
      documentId,
      kind: 'auto',
      state: stateOf('Draft'),
      createdAt: clock.iso(20),
    })

    // Idle for ten minutes at 50, but the newest automatic version is from minute 20: due at 50.
    clock.at(49.9)
    expect(await collab.server.sweepAutoVersions()).toBe(0)
    clock.at(50)
    expect(await collab.server.sweepAutoVersions()).toBe(1)
    expect((await versionsOf(db, documentId)).map((version) => version.kind)).toEqual(['auto', 'auto'])
  })

  it('does not read the document while its version is still deferred, and reads it once it is due', async () => {
    let loads = 0
    await startServer({}, (real) => ({
      ...real,
      load(documentId) {
        loads += 1
        return real.load(documentId)
      },
    }))
    const documentId = await storedDocument(40, stateOf('Draft', 'More'))
    await createVersion(db, {
      workspaceId,
      documentId,
      kind: 'auto',
      state: stateOf('Draft'),
      createdAt: clock.iso(20),
    })

    clock.at(49)
    await collab.server.sweepAutoVersions()
    expect(loads).toBe(0)
    clock.at(50)
    await collab.server.sweepAutoVersions()

    expect(loads).toBe(1)
    expect((await versionsOf(db, documentId)).map((version) => version.kind)).toEqual(['auto', 'auto'])
  })

  it('makes the deferred version later when an edit arrives before it is due, because the edit restarts the idle clock', async () => {
    await startServer()
    const documentId = await storedDocument(40, stateOf('Draft', 'More'))
    await createVersion(db, {
      workspaceId,
      documentId,
      kind: 'auto',
      state: stateOf('Draft'),
      createdAt: clock.iso(20),
    })
    // An edit at minute 48, just before the version was due at 50: it is now due at 58.
    await sql`update document_states set updated_at = ${clock.iso(48)}::timestamptz where document_id = ${documentId}`.execute(
      db,
    )

    clock.at(57.9)
    expect(await collab.server.sweepAutoVersions()).toBe(0)
    clock.at(58)
    expect(await collab.server.sweepAutoVersions()).toBe(1)
  })
})

describe('a document that people have open', () => {
  it('is versioned from the live document, with the edits the store has not written yet, after ten minutes without an update', async () => {
    await startServer()
    const documentId = await storedDocument(0, stateOf('Draft'))
    const person = clients.open(documentId, { email: editor.email })
    await person.waitForSynced()
    clock.at(1)
    person.edit((doc) => appendParagraph(doc, 'More'))
    await person.waitForAcknowledged()
    const viewer = clients.open(documentId, { email: owner.email })
    await viewer.waitForSynced()
    const seen = viewer.waitForEvent('versions-changed')

    clock.at(10.9)
    expect(await collab.server.sweepAutoVersions()).toBe(0)
    clock.at(11)
    expect(await collab.server.sweepAutoVersions()).toBe(1)

    expect(await seen).toEqual({ type: 'versions-changed' })
    const [version] = await versionsOf(db, documentId)
    expect(version?.kind).toBe('auto')
    expect(paragraphsOf(version?.state ?? new Uint8Array())).toEqual(['Draft', 'More'])
  })

  it('waits while somebody is still typing: the idle clock is the last update, not the last store', async () => {
    await startServer()
    const documentId = await storedDocument(0, stateOf('Draft'))
    const person = clients.open(documentId, { email: editor.email })
    await person.waitForSynced()
    clock.at(9)
    person.edit((doc) => appendParagraph(doc, 'More'))
    await person.waitForAcknowledged()

    clock.at(10)
    expect(await collab.server.sweepAutoVersions()).toBe(0)
    clock.at(19)
    expect(await collab.server.sweepAutoVersions()).toBe(1)
    expect(collab.server.hocuspocus.documents.has(documentName(documentId))).toBe(true)
  })
})

describe('the sweep', () => {
  it('runs by itself on the interval the server was given', async () => {
    await startServer({ autoVersionSweepMs: 25 })
    const documentId = await storedDocument(0, stateOf('Draft'))
    clock.at(11)

    await eventually(async () => ((await versionsOf(db, documentId)).length === 1 ? true : undefined))
  })

  it('stops when the server shuts down: a document that becomes due afterwards is left alone', async () => {
    await startServer({ autoVersionSweepMs: 25 })
    await collab.close()
    const documentId = await storedDocument(0, stateOf('Draft'))
    clock.at(11)

    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(await versionsOf(db, documentId)).toEqual([])
  })
})

async function eventually(look: () => Promise<true | undefined>): Promise<void> {
  const deadline = Date.now() + 5_000
  while ((await look()) === undefined) {
    if (Date.now() > deadline) throw new Error('Timed out')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
