// @vitest-environment jsdom
import { editorExtensions, fragmentName } from '@draftroom/editor-schema'
import { jsonToYUpdate } from '@draftroom/editor-schema/convert'
import { Editor } from '@tiptap/core'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { NewBlockText } from './NewBlockText.ts'
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
    {
      when: 'Enter in an empty list item',
      make: (editor) => {
        editor.commands.setContent('<ul><li><p></p></li></ul>')
        editor.commands.setTextSelection(3)
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

  it('is in the first update that leaves, so nobody can receive the block without it', () => {
    const document = new Y.Doc()
    const editor = openHeadlessEditor(document)
    const sent: Uint8Array[] = []
    document.on('update', (update: Uint8Array) => sent.push(update))

    editor.commands.enter()

    // What a person who has only the first update, and types before the second arrives, would build on.
    const received = new Y.Doc()
    Y.applyUpdate(received, sent[0] ?? new Uint8Array())
    expect(shared(received)).toEqual([
      { name: 'paragraph', texts: 1 },
      { name: 'paragraph', texts: 1 },
    ])
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

  it('comes back with its text node when the Enter is redone', () => {
    const earlier = new Y.Doc()
    openHeadlessEditor(earlier).commands.insertContent('Hello')
    const document = new Y.Doc()
    Y.applyUpdate(document, Y.encodeStateAsUpdate(earlier))
    const editor = openHeadlessEditor(document)
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.enter()
    const afterEnter = editor.getJSON()

    editor.commands.undo()
    editor.commands.redo()

    expect(editor.getJSON()).toEqual(afterEnter)
    expect(shared(document)).toEqual([
      { name: 'paragraph', texts: 1 },
      { name: 'paragraph', texts: 1 },
    ])
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

  it('nothing, and no failure, in an editor that has no shared document', () => {
    const editor = new Editor({ extensions: [...editorExtensions(), NewBlockText] })

    editor.commands.enter()

    expect(editor.getJSON().content).toEqual([{ type: 'paragraph' }, { type: 'paragraph' }])
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

describe('documents that already exist', () => {
  it('opens an empty one without writing, and the first letters make one paragraph with one text node', () => {
    // What the server stores for a document nobody has typed in yet (`emptyDocumentState`).
    const document = new Y.Doc()
    Y.applyUpdate(document, Uint8Array.of(0, 0))
    const written = writtenByTheEditor(document)

    const editor = openHeadlessEditor(document)
    expect(written).toEqual([])
    editor.commands.insertContent('Hello')

    expect(shared(document)).toEqual([{ name: 'paragraph', texts: 1 }])
    expect(editor.getText()).toBe('Hello')
  })

  it('opens one that started from a template without writing, and keeps its content as it is', () => {
    const template = {
      type: 'doc' as const,
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Agenda' }] },
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dates' }] }] }],
        },
      ],
    }
    const document = new Y.Doc()
    Y.applyUpdate(document, jsonToYUpdate(template))
    const written = writtenByTheEditor(document)

    const editor = openHeadlessEditor(document)
    expect(written).toEqual([])
    expect(editor.getJSON().content).toEqual(template.content)

    // At the end of the last item's text, which the end of the document is three positions after.
    editor.commands.setTextSelection(editor.state.doc.content.size - 3)
    editor.commands.enter()

    const [heading, list] = editor.getJSON().content ?? []
    expect(heading).toEqual(template.content[0])
    expect(list?.content?.[0]).toEqual(template.content[1]?.content?.[0])
    expect(list?.content).toHaveLength(2)
    expect(shared(document).filter(({ texts }) => texts !== 1)).toEqual([])
  })

  it('merges what was written without a connection with what others wrote, and every block keeps its text node', () => {
    const earlier = new Y.Doc()
    openHeadlessEditor(earlier).commands.insertContent('Plan')
    const daniel = new Y.Doc()
    const priya = new Y.Doc()
    for (const document of [daniel, priya]) Y.applyUpdate(document, Y.encodeStateAsUpdate(earlier))
    const danielEditor = openHeadlessEditor(daniel)
    const priyaEditor = openHeadlessEditor(priya)
    for (const editor of [danielEditor, priyaEditor])
      editor.commands.setTextSelection(editor.state.doc.content.size - 1)

    // Priya has no connection: two Enters and a few words in the first of the new paragraphs, while Daniel adds to the first.
    priyaEditor.commands.enter()
    priyaEditor.commands.insertContent('Offline')
    priyaEditor.commands.enter()
    danielEditor.commands.insertContent(' now')
    Y.applyUpdate(daniel, Y.encodeStateAsUpdate(priya))
    Y.applyUpdate(priya, Y.encodeStateAsUpdate(daniel))

    for (const editor of [danielEditor, priyaEditor]) {
      expect(editor.getText({ blockSeparator: '|' })).toBe('Plan now|Offline|')
    }
    expect(shared(daniel).filter(({ texts }) => texts !== 1)).toEqual([])
    expect(shared(priya)).toEqual(shared(daniel))
  })
})
