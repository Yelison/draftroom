import { MAX_DOCUMENT_STATE_BYTES } from '@draftroom/contract/collab'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { refusesOversizedWrite } from './limits.ts'

describe('refusing a write to a document that is too large', () => {
  const SYNC_STEP_1 = 0
  const SYNC_STEP_2 = 1
  const SYNC_UPDATE = 2

  /** A document with a paragraph, and the updates a client could send it: one that adds, one that deletes, one with nothing new. */
  function scene() {
    const document = new Y.Doc()
    document.getText('t').insert(0, 'hello world')
    const client = new Y.Doc()
    Y.applyUpdate(client, Y.encodeStateAsUpdate(document))
    const updates: Uint8Array[] = []
    client.on('update', (update: Uint8Array) => updates.push(update))
    client.getText('t').insert(0, 'new ')
    client.getText('t').delete(4, 5)
    const [adds, deletes] = updates
    if (adds === undefined || deletes === undefined) throw new Error('The scene made no updates')
    return { document, adds, deletes, nothingNew: Y.encodeStateAsUpdate(document) }
  }

  const over = MAX_DOCUMENT_STATE_BYTES + 1
  // Rows: what the message is, how big the stored state is, whether the connection reads only, and the answer.
  const rows = [
    ['an update that adds content', 'adds', SYNC_UPDATE, over, false, true],
    ['a SyncStep2 that adds content', 'adds', SYNC_STEP_2, over, false, true],
    ['an update that only deletes', 'deletes', SYNC_UPDATE, over, false, false],
    ['a SyncStep2 that adds nothing, as the handshake sends', 'nothingNew', SYNC_STEP_2, over, false, false],
    ['a SyncStep1, which carries a state vector and not an update', 'adds', SYNC_STEP_1, over, false, false],
    [
      'an update that adds content to a document at the limit',
      'adds',
      SYNC_UPDATE,
      MAX_DOCUMENT_STATE_BYTES,
      false,
      false,
    ],
    ['an update that adds content from someone who only reads', 'adds', SYNC_UPDATE, over, true, false],
  ] as const

  it.each(rows)('%s: refused is %j', (_message, which, type, storedSize, readOnly, refused) => {
    const { document, ...payloads } = scene()

    expect(refusesOversizedWrite({ document, type, payload: payloads[which], storedSize, readOnly })).toBe(refused)
  })
})
