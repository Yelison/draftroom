import type { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../../collab/base64.ts'
import { boundDocumentOf, createAnchor, quoteOf, resolveAnchor } from './anchors.ts'
import { pairedEditors, rangeOf } from './testing/pairedEditors.ts'

const world = (content: Parameters<typeof pairedEditors>[0]) => pairedEditors(content)
let open: ReturnType<typeof pairedEditors> | null = null
afterEach(() => open?.destroy())

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const document = (...texts: string[]) => ({ type: 'doc', content: texts.map(paragraph) })

/** The text the anchor covers for this person, or `null` when it points at nothing. */
function covered(editor: Editor, anchor: ReturnType<typeof createAnchor>): string | null {
  const bound = boundDocumentOf(editor.state)
  if (bound === null) throw new Error('The editor is not bound to a document')
  const range = resolveAnchor(bound, anchor)
  return range === null ? null : editor.state.doc.textBetween(range.from, range.to, ' ')
}

function anchorOn(editor: Editor, text: string) {
  const bound = boundDocumentOf(editor.state)
  if (bound === null) throw new Error('The editor is not bound to a document')
  const { from, to } = rangeOf(editor, text)
  return createAnchor(bound, from, to)
}

describe('an anchor made on "cd" of "abcdef" and read by the other person after they typed', () => {
  // Where, in the text of the other person's editor, the character is typed; `at` is the offset into "abcdef".
  const typing = [
    { where: 'before the range', at: 0, expected: 'cd' },
    { where: 'at the start boundary', at: 2, expected: 'cd' },
    { where: 'inside the range', at: 3, expected: 'cXd' },
    { where: 'at the end boundary', at: 4, expected: 'cd' },
    { where: 'after the range', at: 6, expected: 'cd' },
  ]

  it.each(typing)('covers the same characters when they typed $where', ({ at, expected }) => {
    open = world(document('abcdef'))
    const anchor = anchorOn(open.local.editor, 'cd')

    // One past the opening of the paragraph is where its text begins.
    open.remote.editor.commands.insertContentAt(1 + at, 'X')

    // What is typed inside the range is the one thing that belongs to it; everywhere else the characters are the same two.
    expect(covered(open.local.editor, anchor)).toBe(expected)
    expect(covered(open.remote.editor, anchor)).toBe(expected)
  })

  it('is readable by the other person from the moment it is made', () => {
    open = world(document('abcdef'))

    expect(covered(open.remote.editor, anchorOn(open.local.editor, 'cd'))).toBe('cd')
  })

  it('stays on the same characters when the person who made it types around it', () => {
    open = world(document('abcdef'))
    const anchor = anchorOn(open.local.editor, 'cd')

    open.local.editor.commands.insertContentAt(3, 'S')
    open.local.editor.commands.insertContentAt(rangeOf(open.local.editor, 'cd').to, 'E')

    expect(covered(open.local.editor, anchor)).toBe('cd')
  })
})

describe('an anchor that starts where the helper cannot give the start an association', () => {
  // Protocol section 10.2: the start has `assoc = 0` only when it is before a character of the same text node.
  it('starting at the end of a text node, text typed there joins the range', () => {
    open = world(document('abc', 'def'))
    const { local, remote } = { local: open.local.editor, remote: open.remote.editor }
    const bound = boundDocumentOf(local.state)
    if (bound === null) throw new Error('not bound')
    const endOfFirst = rangeOf(local, 'abc').to
    const anchor = createAnchor(bound, endOfFirst, rangeOf(local, 'de').to)

    remote.commands.insertContentAt(endOfFirst, 'Z')

    expect(covered(local, anchor)).toBe('Z de')
  })

  it('starting at a node boundary, text typed at the beginning of that node is inside the range', () => {
    open = world(document('abc', 'def'))
    const { local, remote } = { local: open.local.editor, remote: open.remote.editor }
    const bound = boundDocumentOf(local.state)
    if (bound === null) throw new Error('not bound')
    const startOfSecond = rangeOf(local, 'def').from - 1
    const anchor = createAnchor(bound, startOfSecond, rangeOf(local, 'def').to)

    remote.commands.insertContentAt(startOfSecond + 1, 'Y')

    expect(covered(local, anchor)).toBe('Ydef')
  })
})

describe('an anchor on text that someone deletes', () => {
  it('is orphaned when the whole range is deleted', () => {
    open = world(document('abcdef'))
    const anchor = anchorOn(open.local.editor, 'cd')

    const { from, to } = rangeOf(open.remote.editor, 'cd')
    open.remote.editor.commands.deleteRange({ from, to })

    expect(covered(open.local.editor, anchor)).toBeNull()
  })

  it('keeps what is left when half of the range is deleted', () => {
    open = world(document('abcdef'))
    const anchor = anchorOn(open.local.editor, 'cd')

    const { from } = rangeOf(open.remote.editor, 'cd')
    open.remote.editor.commands.deleteRange({ from, to: from + 1 })

    expect(covered(open.local.editor, anchor)).toBe('d')
  })

  it('is orphaned when the paragraph that held it is removed', () => {
    open = world(document('abcdef', 'ghi'))
    const anchor = anchorOn(open.local.editor, 'cd')

    open.remote.editor.commands.deleteRange({ from: 0, to: rangeOf(open.remote.editor, 'abcdef').to + 1 })

    expect(covered(open.local.editor, anchor)).toBeNull()
  })
})

describe('an anchor that cannot be read', () => {
  const unreadable = [
    { what: 'not base64', start: '*not base64*', end: '*not base64*' },
    { what: 'base64 of something that is not a position', start: toBase64(Uint8Array.of(255, 255)), end: 'AAA=' },
    { what: 'empty', start: '', end: '' },
  ]

  it.each(unreadable)('is orphaned, and does not throw, when it is $what', ({ start, end }) => {
    open = world(document('abcdef'))

    expect(covered(open.local.editor, { start, end })).toBeNull()
  })
})

describe('the quote', () => {
  it('is the text of the range, with a space where a block ends', () => {
    open = world(document('abc', 'def'))
    const local = open.local.editor

    expect(quoteOf(local.state.doc, rangeOf(local, 'bc').from, rangeOf(local, 'de').to)).toBe('bc de')
  })

  it('is cut at 500 code points, never in the middle of one', () => {
    const emoji = '😀'
    open = world(document(emoji.repeat(501)))
    const local = open.local.editor
    const { from, to } = rangeOf(local, emoji.repeat(501))

    const quote = quoteOf(local.state.doc, from, to)

    expect([...quote]).toHaveLength(500)
    expect(quote).toBe(emoji.repeat(500))
  })

  it('is empty when the range holds no text', () => {
    open = world(document('abc'))

    expect(quoteOf(open.local.editor.state.doc, 0, 0)).toBe('')
  })
})
