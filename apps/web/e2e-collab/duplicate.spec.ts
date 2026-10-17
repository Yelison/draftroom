import { execFileSync } from 'node:child_process'
import { MAX_DOCUMENT_STATE_BYTES } from '@draftroom/contract/collab'
import { fragmentName } from '@draftroom/editor-schema'
import * as Y from 'yjs'
import { query, storedText } from './database.ts'
import { environment } from './environment.ts'
import { expect, test } from './fixtures.ts'
import { restAs } from './people.ts'
import { createDocument } from './scene.ts'

const original = 'The plan outgrew its limit.'
const addition = ' The copy takes new words.'

// The map that `@tiptap/y-tiptap` writes on structural edits and never prunes (ADR 0011): what makes a document too large
// without making it long. The limit is a constant of the contract, so the test builds a state over it.
const migrationsMap = '__tiptap_position_migrations:root:default'

/** A document with one paragraph and enough position migrations to be over `MAX_DOCUMENT_STATE_BYTES`. */
function stateOverTheLimit(): Uint8Array {
  const doc = new Y.Doc()
  const paragraph = new Y.XmlElement('paragraph')
  paragraph.insert(0, [new Y.XmlText(original)])
  doc.getXmlFragment(fragmentName).insert(0, [paragraph])
  const map = doc.getMap(migrationsMap)
  const entries = Math.ceil(MAX_DOCUMENT_STATE_BYTES / 1000) + 200
  doc.transact(() => {
    for (let entry = 0; entry < entries; entry += 1) {
      // The shape of a `PositionMigration`, which the page reads when it opens the document: anything else breaks it.
      map.set(`1:${entry}`, {
        version: 1,
        client: 1,
        clock: entry,
        seen: [[1, entry]],
        transfers: Array.from({ length: 20 }, (_, index) => ({
          source: { client: 1, clock: entry * 20 + index, length: 1 },
          target: null,
        })),
      })
    }
  })
  return Y.encodeStateAsUpdate(doc)
}

/**
 * Stores a state straight into the database, as a long editing life would have left it. The statement goes in through the
 * standard input of `psql`: megabytes of hex do not fit in an argument, which is how `query` sends its statements.
 */
function storeState(documentId: string, state: Uint8Array): void {
  const { composeProject, database } = environment
  const statement = `update document_states set state = decode('${Buffer.from(state).toString('hex')}', 'hex') where document_id = '${documentId}';`
  execFileSync(
    'docker',
    ['compose', '-p', composeProject, 'exec', '-T', 'postgres', 'psql', '--username', database.user].concat([
      '--dbname',
      database.name,
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
      '--quiet',
    ]),
    { input: statement, maxBuffer: 64 * 1024 * 1024 },
  )
}

/** What the database holds about a document that a copy must leave as it was: its content and its row. */
const rowsOf = (documentId: string): string[] => [
  ...query(`select md5(state), length(state) from document_states where document_id = '${documentId}'`),
  ...query(`select revision, updated_at from documents where id = '${documentId}'`),
]

test('a document that is over its size limit can be duplicated, the copy takes new writes and the original stays as it was', async ({
  join,
}) => {
  const documentId = await createDocument('daniel', [])
  storeState(documentId, stateOverTheLimit())
  const before = rowsOf(documentId)
  const [stored] = query(`select length(state) from document_states where document_id = '${documentId}'`)
  expect(Number(stored), 'the stored state is over the limit').toBeGreaterThan(MAX_DOCUMENT_STATE_BYTES)
  const daniel = await join('daniel')
  await daniel.open(documentId)
  await expect.poll(() => daniel.text()).toBe(original)

  // A write that adds content to a document over the limit is what the server refuses: that is how the screen gets here.
  await daniel.typeAtEnd('x')
  await expect(daniel.page.getByText('This document is too large to keep editing').first()).toBeVisible()
  await daniel.page.getByRole('button', { name: 'Duplicate as a new document' }).click()

  await expect(daniel.page).toHaveURL((url) => !url.pathname.endsWith(documentId))
  const copyId = new URL(daniel.page.url()).pathname.split('/').at(-1) ?? ''
  const { title } = await restAs('daniel').getDocument({ params: { path: { documentId: copyId } } })
  expect(title).toMatch(/^Copy of “Convergence /)
  await expect(daniel.page.getByRole('heading', { level: 1, name: title })).toBeFocused()
  await expect(daniel.syncStatus).toHaveText('Sync status: Synced')
  await expect.poll(() => daniel.text()).toBe(original)

  await daniel.typeAtEnd(addition)
  await expect.poll(() => storedText(copyId), 'the copy stores what is written in it').toBe(original + addition)
  const [copySize] = query(`select length(state) from document_states where document_id = '${copyId}'`)
  expect(Number(copySize), 'the copy leaves the position migrations behind').toBeLessThan(
    MAX_DOCUMENT_STATE_BYTES / 100,
  )
  expect(rowsOf(documentId), 'the original is exactly as it was: content, revision and timestamp').toEqual(before)
  expect(daniel.unexpectedProblems()).toEqual([])
})
