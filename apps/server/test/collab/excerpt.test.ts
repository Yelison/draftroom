import { fragmentName } from '@draftroom/editor-schema'
import type { Kysely } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createPostgresExcerptWriter, type ExcerptWriter } from '../../src/collab/excerpt.ts'
import { createPostgresStateStore } from '../../src/collab/stateStore.ts'
import type { Database } from '../../src/db/tables.ts'
import { apiOf, bodyAs, type Api } from '../support/api.ts'
import { appendParagraph } from '../support/collab/content.ts'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { ObservedStore } from '../support/collab/observed-store.ts'
import { ClientSet } from '../support/collab/provider-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createTestApp, type TestApp } from '../support/test-app.ts'
import { createDocument, createPerson, createWorkspace, join, type Person } from '../support/world.ts'

// The excerpt of a document is written after its content is stored and acknowledged, and never ahead of the people who
// may read it (plan, T6.1).

let database: TestDatabase
let db: Kysely<Database>
let owner: Person
let outsider: Person
let workspaceId: string
let app: TestApp
let api: Api
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  workspaceId = await createWorkspace(db)
  owner = await createPerson(db, 'Marta Ruiz')
  outsider = await createPerson(db, 'Carol Nwosu')
  await join(db, workspaceId, owner, 'owner')
  await join(db, workspaceId, outsider)
  app = createTestApp(db)
  api = apiOf(app)
})
afterAll(async () => {
  await app.app.close()
  await database.drop()
})

/** The real writer, watched: what the store had written when each call came, and a mode that fails or never answers. */
class WatchedWriter implements ExcerptWriter {
  failing = false
  hanging = false
  /** Every write takes this long: a database that is slow, so that the shutdown has something to wait for. */
  delayMs = 0
  /** How many states the store had written when each call came: zero would mean the excerpt ran ahead of the store. */
  readonly storesWrittenAtCall: number[] = []
  private readonly inner = createPostgresExcerptWriter(db)

  private readonly store: ObservedStore

  constructor(store: ObservedStore) {
    this.store = store
  }

  async write(documentId: string, excerpt: string | null): Promise<void> {
    this.storesWrittenAtCall.push(this.store.succeeded)
    if (this.hanging) return new Promise<void>(() => undefined)
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    if (this.failing) throw new Error('The database is down')
    await this.inner.write(documentId, excerpt)
  }
}

let collab: CollabHarness | undefined
let clients: ClientSet | undefined
afterEach(async () => {
  clients?.destroyAll()
  await collab?.close()
})

async function start() {
  const store = new ObservedStore(createPostgresStateStore(db))
  const writer = new WatchedWriter(store)
  const harness = await startCollab(db, { store, excerpts: writer })
  const set = new ClientSet(harness.url)
  collab = harness
  clients = set
  const documentId = await createDocument(db, { workspaceId, creator: owner, title: 'Private plan' })
  const editor = set.open(documentId, { email: owner.email })
  await editor.waitForSynced()
  return { store, writer, harness, editor, documentId }
}

const excerptOf = async (documentId: string): Promise<string | null> =>
  (await db.selectFrom('documents').select('excerpt').where('id', '=', documentId).executeTakeFirstOrThrow()).excerpt

describe('after a store', () => {
  it('writes the first paragraph to the document, and clears it when the content is gone', async () => {
    const { editor, documentId } = await start()

    editor.edit((doc) => appendParagraph(doc, 'The launch moves to November'))
    await vi.waitFor(async () => expect(await excerptOf(documentId)).toBe('The launch moves to November'))

    editor.edit((doc) => doc.getXmlFragment(fragmentName).delete(0, doc.getXmlFragment(fragmentName).length))
    await vi.waitFor(async () => expect(await excerptOf(documentId)).toBeNull())
  })

  it('leaves the revision and the date of the last change alone, which belong to what people do to a document', async () => {
    const { editor, documentId } = await start()
    const before = await db
      .selectFrom('documents')
      .select(['revision', 'updated_at'])
      .where('id', '=', documentId)
      .executeTakeFirstOrThrow()

    editor.edit((doc) => appendParagraph(doc, 'Typing changes neither'))
    await vi.waitFor(async () => expect(await excerptOf(documentId)).toBe('Typing changes neither'))

    const after = await db
      .selectFrom('documents')
      .select(['revision', 'updated_at'])
      .where('id', '=', documentId)
      .executeTakeFirstOrThrow()
    expect(after).toEqual(before)
  })

  it('computes it from what the store wrote, and only once the store has written it', async () => {
    const { store, writer, editor, documentId } = await start()

    editor.edit((doc) => appendParagraph(doc, 'Stored first'))
    await vi.waitFor(async () => expect(await excerptOf(documentId)).toBe('Stored first'))

    expect(writer.storesWrittenAtCall.every((written) => written >= 1)).toBe(true)
    expect(store.succeeded).toBeGreaterThanOrEqual(1)
  })

  it('does not hold back the acknowledgement or the next store when the write never finishes', async () => {
    const { writer, editor } = await start()
    writer.hanging = true

    const first = editor.edit((doc) => appendParagraph(doc, 'First'))
    await editor.waitForStoredCovering(first)
    const second = editor.edit((doc) => appendParagraph(doc, 'Second'))
    await editor.waitForStoredCovering(second)

    expect(writer.storesWrittenAtCall.length).toBeGreaterThanOrEqual(1)
  })

  it('logs a write that fails, and the content is acknowledged and stored all the same', async () => {
    const { writer, harness, editor, documentId } = await start()
    writer.failing = true

    const typed = editor.edit((doc) => appendParagraph(doc, 'Safe in the database'))
    await editor.waitForStoredCovering(typed)

    await vi.waitFor(() =>
      expect(harness.log.entries).toContainEqual(
        expect.objectContaining({ level: 'error', message: 'updating the excerpt of a document failed' }),
      ),
    )
    expect(await excerptOf(documentId)).toBeNull()

    writer.failing = false
    editor.edit((doc) => appendParagraph(doc, 'And the next store recovers it'))
    await vi.waitFor(async () => expect(await excerptOf(documentId)).toBe('Safe in the database'))
  })
})

describe('a shutdown', () => {
  it('waits for the excerpt of the last store, which the database would otherwise be closed under', async () => {
    const { writer, harness, editor, documentId } = await start()
    writer.delayMs = 150

    const typed = editor.edit((doc) => appendParagraph(doc, 'Written as the server leaves'))
    await editor.waitForStoredCovering(typed)
    await harness.close()

    expect(await excerptOf(documentId)).toBe('Written as the server leaves')
  })

  it('does not wait for ever for an excerpt that never finishes, and says so', async () => {
    const { writer, harness, editor } = await start()
    writer.hanging = true

    await editor.waitForStoredCovering(editor.edit((doc) => appendParagraph(doc, 'Never written')))
    await vi.waitFor(() => expect(writer.storesWrittenAtCall.length).toBe(1))
    await harness.close()

    expect(harness.log.entries).toContainEqual(
      expect.objectContaining({ level: 'error', message: 'shutting down with excerpts that are still being written' }),
    )
  })
})

describe('who can read an excerpt', () => {
  const idsOf = async (as: Person, path: string): Promise<string[]> =>
    bodyAs<{ items: { id: string }[] }>(
      await api({ as, method: 'GET', url: `/api/workspaces/${workspaceId}/${path}` }),
    ).items.map((item) => item.id)

  it('never reaches a person who cannot open the document, in any list, pinned or searched', async () => {
    const { editor, documentId } = await start()
    // A pin that a person made while the document was open to them: removing their access must not leave the text behind.
    await db
      .insertInto('pins')
      .values({ workspace_id: workspaceId, user_id: outsider.id, document_id: documentId })
      .execute()

    editor.edit((doc) => appendParagraph(doc, 'Redundancies are planned for March'))
    await vi.waitFor(async () => expect(await excerptOf(documentId)).toBe('Redundancies are planned for March'))

    for (const path of ['pinned', 'documents', 'shared', 'documents?query=redundancies']) {
      expect(await idsOf(outsider, path)).not.toContain(documentId)
    }
    expect(await idsOf(owner, 'documents?query=redundancies')).toContain(documentId)
  })
})
