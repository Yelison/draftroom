import { execFileSync } from 'node:child_process'
import { fragmentName } from '@draftroom/editor-schema'
import * as Y from 'yjs'
import { environment } from './environment.ts'

const { composeProject, database } = environment

/**
 * One query, run by the `psql` inside the PostgreSQL container of the stack, which is the one thing the suite can reach
 * without a database driver of its own: the answer is the rows, one per line, columns separated by `|`.
 */
export function query(statement: string): string[] {
  const output = execFileSync(
    'docker',
    ['compose', '-p', composeProject, 'exec', '-T', 'postgres']
      .concat([
        'psql',
        '--username',
        database.user,
        '--dbname',
        database.name,
        '--no-psqlrc',
        '--tuples-only',
        '--no-align',
      ])
      .concat(['--set', 'ON_ERROR_STOP=1', '--command', statement]),
    { encoding: 'utf8' },
  )
  return output.split('\n').filter((line) => line !== '')
}

/**
 * The text the database holds for a document: its stored Yjs state, read the way any client would, or `undefined`
 * when nothing was stored yet. What the server answered a client is no proof of this; this is what survives a crash.
 */
export function storedText(documentId: string): string | undefined {
  const [hex] = query(`select encode(state, 'hex') from document_states where document_id = '${documentId}'`)
  if (hex === undefined) return undefined
  const stored = new Y.Doc()
  Y.applyUpdate(stored, Buffer.from(hex, 'hex'))
  const paragraphs = stored.getXmlFragment(fragmentName).toArray()
  return paragraphs.map((paragraph) => paragraph.toString().replace(/<[^>]*>/g, '')).join('\n')
}
