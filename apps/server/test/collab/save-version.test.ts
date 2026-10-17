import type { Schema } from '@draftroom/contract'
import type { Kysely } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { broadcastToDocument } from '../../src/collab/broadcastToDocument.ts'
import { postgresRestoreVersions, type RestoreVersions } from '../../src/collab/restoreVersions.ts'
import type { Database } from '../../src/db/tables.ts'
import { apiOf, bodyAs, type Api } from '../support/api.ts'
import { appendParagraph, documentWith, paragraphsOf, storedParagraphs, storeState } from '../support/collab/content.ts'
import { fastTiming, startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { ClientSet } from '../support/collab/provider-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createTestApp, type TestApp } from '../support/test-app.ts'
import { createVersion, versionsOf } from '../support/versions.ts'
import { createStudio, type Studio } from '../support/world.ts'
import * as Y from 'yjs'

// A version saved by hand is taken from the document as it is now (protocol §11.3): when people have it open that is the
// state in memory, which the store may not have written yet, and it is taken while no restore is half done.

type Version = Schema<'Version'>

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

let database: TestDatabase
let db: Kysely<Database>
let studio: Studio
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  studio = await createStudio(db)
})
afterAll(() => database.drop())

let collab: CollabHarness
let clients: ClientSet
let server: TestApp
let api: Api
async function start(versions?: (real: RestoreVersions) => RestoreVersions, debounceMs = fastTiming.debounceMs) {
  collab = await startCollab(db, {
    timing: { ...fastTiming, debounceMs, maxDebounceMs: Math.max(debounceMs, fastTiming.maxDebounceMs) },
    restoreVersions: (versions ?? ((real) => real))(postgresRestoreVersions(db)),
  })
  clients = new ClientSet(collab.url)
  server = createTestApp(
    db,
    undefined,
    { broadcast: (documentId, event) => broadcastToDocument(collab.server.hocuspocus, documentId, event) },
    undefined,
    undefined,
    collab.server.documents,
  )
  api = apiOf(server)
}
afterEach(async () => {
  clients.destroyAll()
  await server.app.close()
  await collab.close()
})

describe('saving a version of a document that people have open', () => {
  it('holds what the editors typed even when the store has not written it yet', async () => {
    // A store that waits a minute: what is typed is in memory and nowhere else.
    await start(undefined, 60_000)
    await storeState(db, studio.documentId, Y.encodeStateAsUpdate(documentWith('Stored')))
    const editor = clients.open(studio.documentId, { email: studio.owner.email })
    await editor.waitForSynced()
    editor.edit((doc) => appendParagraph(doc, 'Typed, not stored'))
    await editor.waitForAcknowledged()

    const response = await api({
      as: studio.owner,
      method: 'POST',
      url: `/api/documents/${studio.documentId}/versions`,
    })

    expect(response.statusCode).toBe(201)
    const [saved] = await versionsOf(db, studio.documentId)
    expect(paragraphsOf(saved?.state ?? new Uint8Array())).toEqual(['Stored', 'Typed, not stored'])
    expect(await storedParagraphs(db, studio.documentId)).toEqual(['Stored'])
  })

  it('waits for a restore that is half done, and holds the content it leaves', async () => {
    let reached: () => void = () => undefined
    const atTheDatabase = new Promise<void>((resolve) => (reached = resolve))
    let letGo: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (letGo = resolve))
    await start((real) => ({
      ...real,
      async savePreRestore(version) {
        await real.savePreRestore(version)
        reached()
        await gate
      },
    }))
    await storeState(db, studio.documentId, Y.encodeStateAsUpdate(documentWith('Before the restore')))
    const target = await createVersion(db, {
      workspaceId: studio.workspaceId,
      documentId: studio.documentId,
      author: studio.owner,
      state: Y.encodeStateAsUpdate(documentWith('After the restore')),
    })
    const editor = clients.open(studio.documentId, { email: studio.owner.email })
    await editor.waitForSynced()

    const restoring = api({ as: studio.owner, method: 'POST', url: `/api/versions/${target}/restore` })
    await atTheDatabase
    const saving = api({ as: studio.owner, method: 'POST', url: `/api/documents/${studio.documentId}/versions` })
    await pause(150)
    letGo()
    const [restored, saved] = await Promise.all([restoring, saving])

    expect(restored.statusCode).toBe(200)
    expect(saved.statusCode).toBe(201)
    const manual = (await versionsOf(db, studio.documentId)).find((version) => version.id === bodyAs<Version>(saved).id)
    expect(paragraphsOf(manual?.state ?? new Uint8Array())).toEqual(['After the restore'])
  })
})
