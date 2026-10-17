import type { StatelessEvent } from '@draftroom/contract/collab'
import { sql, type Kysely } from 'kysely'
import * as Y from 'yjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database, VersionKind } from '../src/db/tables.ts'
import type { DocumentBroadcaster } from '../src/http/document-broadcaster.ts'
import { apiOf } from './support/api.ts'
import { documentWith, storedParagraphs, storeState } from './support/collab/content.ts'
import { startCollab, type CollabHarness } from './support/collab/harness.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import { createVersion } from './support/versions.ts'
import { createStudio, type Studio } from './support/world.ts'

// The notice that the versions of a document changed goes out after the transaction has committed, never inside it: a
// person who reacts to it and asks again must find the version there. To make that observable the database is made to
// take its time over the commit: a deferred trigger runs when the transaction commits and waits. A notice sent from
// inside the transaction is sent during that wait, and what the check below reads then is the state from before the change.

let database: TestDatabase
let db: Kysely<Database>
let collab: CollabHarness
let server: TestApp
let studio: Studio
/** What the database held as each notice went out, asked from a connection of its own. */
const heldWhenTold: Array<Promise<{ kinds: VersionKind[]; paragraphs: string[] }>> = []
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  studio = await createStudio(db)
  collab = await startCollab(db)
  const broadcaster: DocumentBroadcaster = {
    broadcast: (documentId, event: StatelessEvent) => {
      if (event.type !== 'versions-changed') return
      heldWhenTold.push(
        (async () => ({
          kinds: (
            await db
              .selectFrom('document_versions')
              .select('kind')
              .where('document_id', '=', documentId)
              .orderBy('created_at')
              .execute()
          ).map((row) => row.kind),
          paragraphs: await storedParagraphs(db, documentId),
        }))(),
      )
    },
  }
  server = createTestApp(db, undefined, broadcaster, undefined, undefined, collab.server.documents)
  await sql`create function slow_commit() returns trigger language plpgsql as $$
    begin perform pg_sleep(0.3); return null; end $$`.execute(db)
  await sql`create constraint trigger document_versions_slow_commit after insert or update or delete on document_versions
    deferrable initially deferred for each row execute function slow_commit()`.execute(db)
})
afterAll(async () => {
  await server.app.close()
  await collab.close()
  await database.drop()
})

describe('the notice that the versions changed', () => {
  it('goes out after a saved version has committed', async () => {
    heldWhenTold.length = 0
    await storeState(db, studio.documentId, Y.encodeStateAsUpdate(documentWith('Autumn plan')))

    const response = await apiOf(server)({
      as: studio.owner,
      method: 'POST',
      url: `/api/documents/${studio.documentId}/versions`,
    })

    expect(response.statusCode).toBe(201)
    expect(await Promise.all(heldWhenTold)).toEqual([
      { kinds: expect.arrayContaining(['manual']), paragraphs: ['Autumn plan'] },
    ])
  })

  it('goes out after a restore has committed its version and the restored content, not before', async () => {
    heldWhenTold.length = 0
    const versionId = await createVersion(db, {
      workspaceId: studio.workspaceId,
      documentId: studio.documentId,
      author: studio.owner,
      state: Y.encodeStateAsUpdate(documentWith('Restored')),
    })

    const response = await apiOf(server)({
      as: studio.owner,
      method: 'POST',
      url: `/api/versions/${versionId}/restore`,
    })

    expect(response.statusCode).toBe(200)
    const [held] = await Promise.all(heldWhenTold)
    expect(held?.kinds).toEqual(expect.arrayContaining(['pre-restore', 'restore']))
    expect(held?.paragraphs).toEqual(['Restored'])
  })
})
