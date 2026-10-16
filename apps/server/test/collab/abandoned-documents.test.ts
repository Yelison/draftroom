import { documentName } from '@draftroom/contract/collab'
import { sql, type Kysely } from 'kysely'
import * as Y from 'yjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import { apiOf } from '../support/api.ts'
import { documentWith, storeState } from '../support/collab/content.ts'
import { startCollab } from '../support/collab/harness.ts'
import { ClientSet } from '../support/collab/provider-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createTestApp } from '../support/test-app.ts'
import { createStudio, type Studio } from '../support/world.ts'

// Hocuspocus unloads a document at one moment: when its last connection closes, and only if nothing holds the store
// mutex then. It never looks again. A version being saved holds the mutex, so a person who closes the document while it
// is saved would leave it in memory for ever, with nobody connected, unless whoever held the mutex looks again.

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

let database: TestDatabase
let db: Kysely<Database>
let studio: Studio
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  studio = await createStudio(db)
  // The commit of a version takes its time, so the mutex is held while the person leaves.
  await sql`create function slow_commit() returns trigger language plpgsql as $$
    begin perform pg_sleep(0.5); return null; end $$`.execute(db)
  await sql`create constraint trigger document_versions_slow_commit after insert on document_versions
    deferrable initially deferred for each row execute function slow_commit()`.execute(db)
})
afterAll(() => database.drop())

describe('a document whose last person leaves while a version is being saved', () => {
  it('is unloaded once the version is saved, because nobody has it open', async () => {
    const collab = await startCollab(db)
    const server = createTestApp(db, undefined, undefined, undefined, undefined, collab.server.documents)
    const clients = new ClientSet(collab.url)
    try {
      await storeState(db, studio.documentId, Y.encodeStateAsUpdate(documentWith('Open')))
      const person = clients.open(studio.documentId, { email: studio.owner.email })
      await person.waitForSynced()
      // Nothing is left to store, so closing would unload the document at once if the mutex were free.
      await pause(300)

      const saving = apiOf(server)({
        as: studio.owner,
        method: 'POST',
        url: `/api/documents/${studio.documentId}/versions`,
      })
      await pause(150)
      const live = collab.server.hocuspocus.documents.get(documentName(studio.documentId))
      expect(live?.saveMutex.isLocked()).toBe(true)
      clients.destroyAll()
      expect((await saving).statusCode).toBe(201)

      const unloaded = async (): Promise<boolean> => {
        const deadline = Date.now() + 3_000
        while (collab.server.hocuspocus.documents.has(documentName(studio.documentId))) {
          if (Date.now() > deadline) return false
          await pause(25)
        }
        return true
      }
      expect(await unloaded()).toBe(true)
    } finally {
      clients.destroyAll()
      await server.app.close()
      await collab.close()
    }
  })
})
