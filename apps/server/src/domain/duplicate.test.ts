import { fragmentName } from '@draftroom/editor-schema'
import { InvalidDocumentError, yUpdateToJson } from '@draftroom/editor-schema/convert'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { copyOfContent } from './duplicate.ts'

const migrationsMap = '__tiptap_position_migrations:root:default'

function stateOf(text: string, migrations = 0): Uint8Array {
  const doc = new Y.Doc()
  const paragraph = new Y.XmlElement('paragraph')
  paragraph.insert(0, [new Y.XmlText(text)])
  doc.getXmlFragment(fragmentName).insert(0, [paragraph])
  for (let entry = 0; entry < migrations; entry += 1) {
    // The shape of a `PositionMigration`, as `@tiptap/y-tiptap` writes it.
    doc.getMap(migrationsMap).set(`1:${entry}`, {
      version: 1,
      client: 1,
      clock: entry,
      seen: [[1, entry]],
      transfers: Array.from({ length: 10 }, (_, index) => ({
        source: { client: 1, clock: entry * 10 + index, length: 1 },
        target: null,
      })),
    })
  }
  return Y.encodeStateAsUpdate(doc)
}

describe('the copy of a content', () => {
  it('has the text of the original and the excerpt a list shows for it', () => {
    const { state, excerpt } = copyOfContent(stateOf('Ship before the fair'))

    expect(yUpdateToJson(state)).toEqual(yUpdateToJson(stateOf('Ship before the fair')))
    expect(excerpt).toBe('Ship before the fair')
  })

  it('does not carry the map of position migrations', () => {
    const original = stateOf('Ship before the fair', 100)

    const { state } = copyOfContent(original)

    const doc = new Y.Doc()
    Y.applyUpdate(doc, state)
    expect(doc.getMap(migrationsMap).size).toBe(0)
    expect(state.byteLength).toBeLessThan(original.byteLength / 50)
  })

  it('refuses a state the schema cannot read, as the reader of the collaboration server does', () => {
    const broken = new Y.Doc()
    broken.getXmlFragment(fragmentName).insert(0, [new Y.XmlElement('nonsense')])

    expect(() => copyOfContent(Y.encodeStateAsUpdate(broken))).toThrow(InvalidDocumentError)
  })
})
