import type { JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { InvalidDocumentError, jsonToYUpdate, replaceFragmentContent, yUpdateToJson } from './convert.ts'
import { fragmentName } from './extensions.ts'

type Mark = { type: string; attrs?: Record<string, unknown> }

const text = (value: string, ...marks: Mark[]): JSONContent => ({
  type: 'text',
  text: value,
  ...(marks.length > 0 && { marks }),
})
const paragraph = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content })
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })
const listItem = (...content: JSONContent[]): JSONContent => ({ type: 'listItem', content })
const link = (href: string): Mark => ({ type: 'link', attrs: { href } })

/** A document written to Yjs and read back: what the server stores and later reads. */
const roundTrip = (json: JSONContent) => yUpdateToJson(jsonToYUpdate(json))

describe('the round trip of every node', () => {
  const nodes: [string, JSONContent][] = [
    ['a paragraph', doc(paragraph(text('A line of text')))],
    ['an empty paragraph', doc({ type: 'paragraph' })],
    ['a heading of level 2', doc({ type: 'heading', attrs: { level: 2 }, content: [text('Heading')] })],
    ['a heading of level 3', doc({ type: 'heading', attrs: { level: 3 }, content: [text('Subheading')] })],
    [
      'a bulleted list',
      doc({ type: 'bulletList', content: [listItem(paragraph(text('One'))), listItem(paragraph(text('Two')))] }),
    ],
    [
      'a numbered list that starts at 1',
      doc({ type: 'orderedList', attrs: { start: 1, type: null }, content: [listItem(paragraph(text('One')))] }),
    ],
    [
      'a numbered list that starts at 4',
      doc({ type: 'orderedList', attrs: { start: 4, type: null }, content: [listItem(paragraph(text('Four')))] }),
    ],
    [
      'a list inside a list item',
      doc({
        type: 'bulletList',
        content: [
          listItem(paragraph(text('Outer')), {
            type: 'orderedList',
            attrs: { start: 1, type: null },
            content: [listItem(paragraph(text('Inner')))],
          }),
        ],
      }),
    ],
    ['text in several blocks', doc(paragraph(text('First')), paragraph(text('Second')))],
    ['accents, an emoji and Spanish punctuation', doc(paragraph(text('¿Qué tal, Sofía? 👩🏽‍💻 Ñandú')))],
  ]

  it.each(nodes)('keeps %s', (_name, json) => {
    expect(roundTrip(json)).toEqual(json)
  })
})

describe('the round trip of every mark', () => {
  const marks: [string, Mark][] = [
    ['bold', { type: 'bold' }],
    ['italic', { type: 'italic' }],
    ['code', { type: 'code' }],
    ['a link', link('https://example.com/page?query=1#part')],
    ['a mail link', link('mailto:ana@example.com')],
  ]

  it.each(marks)('keeps %s', (_name, mark) => {
    const json = doc(paragraph(text('before '), text('marked', mark), text(' after')))

    expect(roundTrip(json)).toEqual(json)
  })

  it('keeps several marks on the same text, in the order of the schema', () => {
    const json = doc(paragraph(text('everything', link('https://example.com'), { type: 'bold' }, { type: 'italic' })))

    expect(roundTrip(json)).toEqual(json)
  })

  it('keeps marks inside a list item and a heading', () => {
    const json = doc(
      { type: 'heading', attrs: { level: 2 }, content: [text('Title ', { type: 'bold' })] },
      { type: 'bulletList', content: [listItem(paragraph(text('item', { type: 'italic' })))] },
    )

    expect(roundTrip(json)).toEqual(json)
  })
})

describe('what the conversion refuses', () => {
  const unknownNodes: [string, JSONContent][] = [
    ['a blockquote', { type: 'blockquote', content: [paragraph(text('quote'))] }],
    ['a code block', { type: 'codeBlock', content: [text('code')] }],
    ['a horizontal rule', { type: 'horizontalRule' }],
    ['a table', { type: 'table', content: [] }],
    ['an image', { type: 'image', attrs: { src: 'https://example.com/a.png' } }],
    ['a node nobody defined', { type: 'madeUp' }],
  ]

  it.each(unknownNodes)('refuses a document with %s', (_name, node) => {
    expect(() => jsonToYUpdate(doc(node))).toThrow(InvalidDocumentError)
  })

  it('refuses a hard break, which is not in the schema', () => {
    expect(() => jsonToYUpdate(doc(paragraph(text('a'), { type: 'hardBreak' })))).toThrow(InvalidDocumentError)
  })

  it.each(['strike', 'underline', 'highlight', 'textStyle'])(
    'refuses the %s mark, which is not in the schema',
    (mark) => {
      expect(() => jsonToYUpdate(doc(paragraph(text('marked', { type: mark }))))).toThrow(InvalidDocumentError)
    },
  )

  const badStructure: [string, JSONContent][] = [
    ['a root that is not a document', paragraph(text('a'))],
    ['an empty document', { type: 'doc' }],
    ['text straight in the document', doc(text('loose text'))],
    ['a list item outside a list', doc(listItem(paragraph(text('a'))))],
    ['a list with no items', doc({ type: 'bulletList' })],
    ['an empty text node', doc(paragraph({ type: 'text', text: '' }))],
    [
      'a heading of level 1, which the schema does not have',
      doc({ type: 'heading', attrs: { level: 1 }, content: [text('H1')] }),
    ],
    ['a heading with no level, which would be level 1', doc({ type: 'heading', content: [text('H')] })],
    [
      'a numbered list that starts at -5',
      doc({ type: 'orderedList', attrs: { start: -5, type: null }, content: [listItem(paragraph(text('x')))] }),
    ],
    [
      'a numbered list that starts at 1e20',
      doc({ type: 'orderedList', attrs: { start: 1e20, type: null }, content: [listItem(paragraph(text('x')))] }),
    ],
    [
      'a numbered list with a style that does not exist',
      doc({ type: 'orderedList', attrs: { start: 1, type: 'x' }, content: [listItem(paragraph(text('x')))] }),
    ],
    ['a heading of level 4', doc({ type: 'heading', attrs: { level: 4 }, content: [text('H4')] })],
  ]

  it.each(badStructure)('refuses %s', (_name, json) => {
    expect(() => jsonToYUpdate(json)).toThrow(InvalidDocumentError)
  })

  const hostileLinks = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '/relative/path',
    '//evil.example',
    'example.com',
    '',
  ]

  it.each(hostileLinks)('refuses a link to %j and says what it was', (href) => {
    expect(() => jsonToYUpdate(doc(paragraph(text('click', link(href)))))).toThrow(
      /A link points to an address that is not allowed/,
    )
  })

  it('keeps the library message as the cause, for whoever logs it', () => {
    const attempt = () => jsonToYUpdate(doc({ type: 'madeUp' }))

    expect(attempt).toThrow(expect.objectContaining({ name: 'InvalidDocumentError', cause: expect.any(RangeError) }))
  })

  it("leaves out the attributes the schema does not define, and writes the schema's own form", () => {
    const json = doc(
      { type: 'paragraph', attrs: { class: 'wide', style: 'color: red' }, content: [text('x')] },
      paragraph(
        text('a link', {
          type: 'link',
          attrs: { href: 'https://example.com', target: '_top', rel: 'opener', class: 'x', title: 't' },
        }),
      ),
    )

    expect(roundTrip(json)).toEqual(doc(paragraph(text('x')), paragraph(text('a link', link('https://example.com')))))
  })
})

describe('the Yjs document', () => {
  it('holds the content in a fragment called default, and in no other', () => {
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, jsonToYUpdate(doc(paragraph(text('Hello')), paragraph(text('World')))))

    expect([...ydoc.share.keys()]).toEqual(['default'])
    expect(ydoc.getXmlFragment('default').length).toBe(2)
  })

  it('reads the content back from a document that was edited in Yjs, not only from one that was converted', () => {
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, jsonToYUpdate(doc(paragraph(text('Hello')))))
    const typed = ydoc.getXmlFragment('default').get(0) as Y.XmlElement
    ;(typed.get(0) as Y.XmlText).insert(5, ' there')

    expect(yUpdateToJson(Y.encodeStateAsUpdate(ydoc))).toEqual(doc(paragraph(text('Hello there'))))
  })

  it('merges into a live document like any other update', () => {
    const live = new Y.Doc()
    Y.applyUpdate(live, jsonToYUpdate(doc(paragraph(text('Template text')))))
    const other = new Y.Doc()
    Y.applyUpdate(other, Y.encodeStateAsUpdate(live))

    expect(yUpdateToJson(Y.encodeStateAsUpdate(other))).toEqual(doc(paragraph(text('Template text'))))
  })

  it('reads a state with no content yet as the empty paragraph the editor shows', () => {
    const empty = Y.encodeStateAsUpdate(new Y.Doc())

    expect(yUpdateToJson(empty)).toEqual(doc({ type: 'paragraph' }))
  })

  it('refuses to read stored content the schema does not hold', () => {
    const ydoc = new Y.Doc()
    ydoc.getXmlFragment('default').insert(0, [new Y.XmlElement('blockquote')])

    expect(() => yUpdateToJson(Y.encodeStateAsUpdate(ydoc))).toThrow(InvalidDocumentError)
  })

  it('refuses to read a stored link whose address is not allowed', () => {
    const ydoc = new Y.Doc()
    const stored = new Y.XmlElement('paragraph')
    const words = new Y.XmlText()
    stored.insert(0, [words])
    ydoc.getXmlFragment('default').insert(0, [stored])
    words.insert(0, 'click', { link: { href: 'javascript:alert(1)' } })

    expect(() => yUpdateToJson(Y.encodeStateAsUpdate(ydoc))).toThrow(/not allowed/)
  })

  it('does not need a DOM', () => {
    // The package compiles without the DOM types, so this only guards the environment the tests run in.
    expect('document' in globalThis).toBe(false)
    expect('window' in globalThis).toBe(false)
  })
})

describe('replacing the content of a live fragment', () => {
  /** A live document that holds this content, as a server holds one that was loaded from its stored state. */
  const liveWith = (json: JSONContent): Y.Doc => {
    const live = new Y.Doc()
    Y.applyUpdate(live, jsonToYUpdate(json))
    return live
  }
  const replace = (live: Y.Doc, json: JSONContent, origin?: unknown): void =>
    live.transact(() => replaceFragmentContent(live.getXmlFragment(fragmentName), json), origin)
  const contentOf = (live: Y.Doc): JSONContent => yUpdateToJson(Y.encodeStateAsUpdate(live))

  it('leaves the fragment holding exactly the new content', () => {
    const live = liveWith(doc(paragraph(text('First')), paragraph(text('Second'))))
    const restored = doc({ type: 'heading', attrs: { level: 2 }, content: [text('Title')] }, paragraph(text('Body')))

    replace(live, restored)

    expect(contentOf(live)).toEqual(restored)
  })

  it('keeps the nodes it does not have to change, so an edit made to one of them meanwhile survives', () => {
    const live = liveWith(doc(paragraph(text('Kept')), paragraph(text('Removed'))))
    const kept = live.getXmlFragment(fragmentName).get(0)
    const peer = new Y.Doc()
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(live))
    const peerParagraph = peer.getXmlFragment(fragmentName).get(0)
    if (!(peerParagraph instanceof Y.XmlElement)) throw new Error('The paragraph is missing')
    const peerText = peerParagraph.get(0)
    if (!(peerText instanceof Y.XmlText)) throw new Error('The text is missing')

    replace(live, doc(paragraph(text('Kept')), paragraph(text('Added'))))
    peerText.insert(4, ' and edited')
    Y.applyUpdate(live, Y.encodeStateAsUpdate(peer, Y.encodeStateVector(live)))

    expect(live.getXmlFragment(fragmentName).get(0)).toBe(kept)
    expect(contentOf(live)).toEqual(doc(paragraph(text('Kept and edited')), paragraph(text('Added'))))
  })

  it('changes nothing for content that is already there', () => {
    const json = doc(paragraph(text('Same')))
    const live = liveWith(json)
    const before = Y.encodeStateVector(live)

    replace(live, json)

    expect(Y.encodeStateVector(live)).toEqual(before)
  })

  it('writes in the transaction of its caller, so the update carries the origin the caller gave it', () => {
    const live = liveWith(doc(paragraph(text('Before'))))
    const origins: unknown[] = []
    live.on('update', (_update: Uint8Array, origin: unknown) => origins.push(origin))

    replace(live, doc(paragraph(text('After'))), 'restore')

    expect(origins).toEqual(['restore'])
  })

  it('touches the fragment and no other root of the document', () => {
    const live = liveWith(doc(paragraph(text('Before'))))
    const positions = live.getMap('__tiptap_position_migrations:root:default')
    positions.set('1:0', 'a state vector')
    const changed: unknown[] = []
    live.on('afterTransaction', (transaction) => changed.push(...transaction.changed.keys()))

    replace(live, doc(paragraph(text('After'))))

    expect(changed).not.toContain(positions)
    expect([...positions.entries()]).toEqual([['1:0', 'a state vector']])
  })

  it.each<[string, JSONContent]>([
    ['a node the schema does not have', doc({ type: 'table' })],
    [
      'a heading level the schema does not have',
      doc({ type: 'heading', attrs: { level: 5 }, content: [text('Deep')] }),
    ],
    ['a link whose address is not allowed', doc(paragraph(text('Click', link('javascript:alert(1)'))))],
  ])('refuses %s and leaves the live content as it was', (_name, json) => {
    const original = doc(paragraph(text('Untouched')))
    const live = liveWith(original)

    expect(() => replace(live, json)).toThrow(InvalidDocumentError)

    expect(contentOf(live)).toEqual(original)
  })
})
