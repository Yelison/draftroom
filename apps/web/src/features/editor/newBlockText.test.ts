// @vitest-environment jsdom
import { fragmentName } from '@draftroom/editor-schema'
import type { Editor } from '@tiptap/core'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { openHeadlessEditor } from './testing/headlessEditor.ts'

const textBlockNames = new Set(['paragraph', 'heading'])

/** The text blocks of a Yjs fragment, at any depth, with how many text nodes each holds. */
function textBlocksOf(node: Y.XmlFragment | Y.XmlElement | Y.XmlText): { name: string; texts: number }[] {
  if (node instanceof Y.XmlText) return []
  const own =
    node instanceof Y.XmlElement && textBlockNames.has(node.nodeName)
      ? [{ name: node.nodeName, texts: node.toArray().filter((child) => child instanceof Y.XmlText).length }]
      : []
  return [...own, ...node.toArray().flatMap((child) => textBlocksOf(child as Y.XmlElement | Y.XmlText))]
}

/** The updates that the editor wrote into `document`, as opposed to the ones that arrived from somewhere else. */
function writtenByTheEditor(document: Y.Doc): Uint8Array[] {
  const written: Uint8Array[] = []
  document.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === ySyncPluginKey) written.push(update)
  })
  return written
}

const shared = (document: Y.Doc) => textBlocksOf(document.getXmlFragment(fragmentName))

describe('a text block that the editor creates', () => {
  const creations: { when: string; make: (editor: Editor) => void }[] = [
    { when: 'Enter at the end of a paragraph', make: (editor) => editor.commands.enter() },
    {
      when: 'Enter in a list item with text',
      make: (editor) => {
        editor.commands.setContent('<ul><li><p>First</p></li></ul>')
        editor.commands.setTextSelection(editor.state.doc.content.size - 2)
        editor.commands.enter()
      },
    },
    { when: 'a paragraph made a heading', make: (editor) => editor.commands.setHeading({ level: 2 }) },
    { when: 'a paragraph made a list', make: (editor) => editor.commands.toggleBulletList() },
  ]

  it.each(creations)('has its text node in the shared document at once: $when', ({ make }) => {
    const document = new Y.Doc()
    const editor = openHeadlessEditor(document)

    make(editor)

    const blocks = shared(document)
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.filter(({ texts }) => texts !== 1)).toEqual([])
  })

  it('takes the first letter into that same text node, so a second person never gets one of their own', () => {
    const document = new Y.Doc()
    const editor = openHeadlessEditor(document)
    editor.commands.enter()

    editor.commands.insertContent('Hello')

    expect(shared(document)).toEqual([
      { name: 'paragraph', texts: 1 },
      { name: 'paragraph', texts: 1 },
    ])
    expect(editor.getText({ blockSeparator: '|' })).toBe('|Hello')
  })

  it('is undone with the Enter that made it, leaving the document as it was', () => {
    // The text comes from elsewhere, so what the editor can undo is the Enter and nothing else.
    const earlier = new Y.Doc()
    openHeadlessEditor(earlier).commands.insertContent('Hello')
    const document = new Y.Doc()
    Y.applyUpdate(document, Y.encodeStateAsUpdate(earlier))
    const editor = openHeadlessEditor(document)
    const before = editor.getJSON()
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)

    editor.commands.enter()
    expect(editor.getJSON()).not.toEqual(before)
    editor.commands.undo()

    expect(editor.getJSON()).toEqual(before)
    expect(shared(document)).toEqual([{ name: 'paragraph', texts: 1 }])
  })
})

describe('what the editor does not write', () => {
  it('nothing when it opens a document that already has a block with no text node', () => {
    const stored = new Y.Doc()
    stored.getXmlFragment(fragmentName).insert(0, [new Y.XmlElement('paragraph')])
    const document = new Y.Doc()
    Y.applyUpdate(document, Y.encodeStateAsUpdate(stored))
    const written = writtenByTheEditor(document)

    const editor = openHeadlessEditor(document)
    editor.commands.setTextSelection(1)

    expect(written).toEqual([])
    expect(shared(document)).toEqual([{ name: 'paragraph', texts: 0 }])
  })

  it('nothing when a block that somebody else made reaches it', () => {
    const daniel = new Y.Doc()
    const priya = new Y.Doc()
    const danielEditor = openHeadlessEditor(daniel)
    openHeadlessEditor(priya)
    const writtenByPriya = writtenByTheEditor(priya)

    // A client that does not fill its blocks, such as one that was open before this change.
    daniel.getXmlFragment(fragmentName).insert(0, [new Y.XmlElement('paragraph')])
    Y.applyUpdate(priya, Y.encodeStateAsUpdate(daniel))

    expect(danielEditor.getJSON().content).toEqual([{ type: 'paragraph' }])
    expect(writtenByPriya).toEqual([])
    expect(shared(priya)).toEqual([{ name: 'paragraph', texts: 0 }])
  })
})
