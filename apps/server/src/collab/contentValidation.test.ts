import { jsonToYUpdate } from '@draftroom/editor-schema/convert'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { isReadable, removeForbiddenBlocks } from './contentValidation.ts'

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const fragment = (doc: Y.Doc) => doc.getXmlFragment('default')

/** A document with these paragraphs, built as the schema's own writer builds one. */
function documentOf(...texts: string[]): Y.Doc {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, jsonToYUpdate({ type: 'doc', content: texts.map(paragraph) }))
  return doc
}

function addHeading(doc: Y.Doc, level: number, text: string): void {
  const heading = new Y.XmlElement('heading')
  heading.setAttribute('level', level as unknown as string)
  heading.insert(0, [new Y.XmlText(text)])
  fragment(doc).push([heading])
}

const textsOf = (doc: Y.Doc) =>
  fragment(doc)
    .toArray()
    .map((block) => block.toString())

describe('whether a state can be read by the schema', () => {
  it('is true for content the schema allows, and for a document nobody has typed in', () => {
    expect(isReadable(Y.encodeStateAsUpdate(documentOf('allowed')))).toBe(true)
    expect(isReadable(Uint8Array.of(0, 0))).toBe(true)
  })

  it('is false for a heading of a level the schema does not have', () => {
    const doc = documentOf('fine')
    addHeading(doc, 1, 'too big')

    expect(isReadable(Y.encodeStateAsUpdate(doc))).toBe(false)
  })
})

describe('removing the blocks the schema refuses', () => {
  it('removes only those blocks, and says how many', () => {
    const doc = documentOf('before', 'after')
    addHeading(doc, 1, 'refused')
    addHeading(doc, 2, 'allowed')
    addHeading(doc, 4, 'refused too')

    const removed = removeForbiddenBlocks(doc)

    expect(removed).toBe(2)
    expect(textsOf(doc).map((xml) => /<(\w+)/.exec(xml)?.[1])).toEqual(['paragraph', 'paragraph', 'heading'])
    expect(isReadable(Y.encodeStateAsUpdate(doc))).toBe(true)
  })

  it('does nothing to a document that has nothing to remove', () => {
    const doc = documentOf('one', 'two')
    const updates: unknown[] = []
    doc.on('update', (update: Uint8Array) => updates.push(update))

    expect(removeForbiddenBlocks(doc)).toBe(0)
    expect(updates).toEqual([])
  })

  it('removes it in a transaction of the server that asks for no store of its own, since the store that called it captures right after', () => {
    const doc = documentOf('kept')
    addHeading(doc, 1, 'refused')
    const origins: unknown[] = []
    doc.on('update', (_update: Uint8Array, origin: unknown) => origins.push(origin))

    removeForbiddenBlocks(doc)

    expect(origins).toEqual([{ source: 'local', skipStoreHooks: true }])
  })
})
