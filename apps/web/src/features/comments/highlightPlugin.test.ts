import type { Editor } from '@tiptap/core'
import { yUndoPluginKey } from '@tiptap/y-tiptap'
import { afterEach, describe, expect, it } from 'vitest'
import { boundDocumentOf, createAnchor, resolveAnchor } from './anchors.ts'
import { createCommentRequests, type CommentRequest } from './commentRequests.ts'
import {
  commentHighlights,
  highlightedThreads,
  placementOf,
  resolvedThreads,
  threadAt,
  showHighlights,
  type HighlightedThread,
} from './highlightPlugin.ts'
import { pairedEditors, rangeOf } from './testing/pairedEditors.ts'

let open: ReturnType<typeof withHighlights> | null = null
afterEach(() => open?.destroy())

const document = (...texts: string[]) => ({
  type: 'doc',
  content: texts.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
})

/** Two people on one document, the local one with the highlight plugin, as the editor of the screen has it. */
const withHighlights = (...texts: string[]) => pairedEditors(document(...texts), [commentHighlights])

function threadOn(editor: Editor, id: string, text: string): HighlightedThread {
  const bound = boundDocumentOf(editor.state)
  if (bound === null) throw new Error('not bound')
  const { from, to } = rangeOf(editor, text)
  return { id, anchor: createAnchor(bound, from, to) }
}

/** What the decorations of the editor cover, as text, one entry for each highlighted range. */
function highlighted(editor: Editor): string[] {
  const state = editor.state
  return placements(editor).flatMap((placement) =>
    placement.status === 'placed' ? [state.doc.textBetween(placement.from, placement.to, ' ')] : [],
  )
}

function placements(editor: Editor) {
  return ['a', 'b'].map((id) => placementOf(editor.state, id))
}

describe('what the plugin knows before the first handshake', () => {
  it('lists the threads without a highlight and without calling any of them orphaned', () => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    showHighlights(editor, [threadOn(editor, 'a', 'cd')], { handshaken: false })

    expect(placementOf(editor.state, 'a')).toEqual({ status: 'unresolved' })
    expect(editor.view.dom.querySelector('mark')).toBeNull()
  })

  it('does not call a thread orphaned even when its text is not there yet', () => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    const missing = { id: 'a', anchor: { start: 'AQAKAA==', end: 'AQAYAQ==' } }

    showHighlights(editor, [missing], { handshaken: false })

    expect(placementOf(editor.state, 'a')).toEqual({ status: 'unresolved' })
  })

  it('places them as soon as the handshake is done', () => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    showHighlights(editor, [threadOn(editor, 'a', 'cd')], { handshaken: false })

    showHighlights(editor, [threadOn(editor, 'a', 'cd')], { handshaken: true })

    expect(highlighted(editor)).toEqual(['cd'])
    expect(editor.view.dom.querySelector('mark')?.textContent).toBe('cd')
  })
})

describe('a thread whose text the other person changes', () => {
  const typing = [
    { where: 'before it', at: 0, expected: 'cd' },
    { where: 'at its start', at: 2, expected: 'cd' },
    { where: 'inside it', at: 3, expected: 'cXd' },
    { where: 'at its end', at: 4, expected: 'cd' },
    { where: 'after it', at: 6, expected: 'cd' },
  ]

  it.each(typing)('keeps its highlight on the same characters when they type $where', ({ at, expected }) => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    showHighlights(editor, [threadOn(editor, 'a', 'cd')], { handshaken: true })

    open.remote.editor.commands.insertContentAt(1 + at, 'X')

    expect(highlighted(editor)).toEqual([expected])
  })

  it('is orphaned, with no highlight, when they delete the whole range', () => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    showHighlights(editor, [threadOn(editor, 'a', 'cd')], { handshaken: true })

    const { from, to } = rangeOf(open.remote.editor, 'cd')
    open.remote.editor.commands.deleteRange({ from, to })

    expect(placementOf(editor.state, 'a')).toEqual({ status: 'orphaned' })
    expect(editor.view.dom.querySelector('mark')).toBeNull()
  })

  it('keeps only the part that is left when they delete half of it', () => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    showHighlights(editor, [threadOn(editor, 'a', 'cd')], { handshaken: true })

    const { from } = rangeOf(open.remote.editor, 'cd')
    open.remote.editor.commands.deleteRange({ from, to: from + 1 })

    expect(highlighted(editor)).toEqual(['d'])
  })

  it('goes back to the text when they undo the deletion that orphaned it', () => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    showHighlights(editor, [threadOn(editor, 'a', 'cd')], { handshaken: true })
    const { from, to } = rangeOf(editor, 'cd')
    // The content just written and the deletion are one undo step unless the history is told they are not.
    yUndoPluginKey.getState(editor.state)?.undoManager.stopCapturing()

    editor.commands.deleteRange({ from, to })
    expect(placementOf(editor.state, 'a')).toEqual({ status: 'orphaned' })
    editor.commands.undo()

    expect(highlighted(editor)).toEqual(['cd'])
  })
})

describe('a thread whose text the person who sees it types around', () => {
  // The Yjs document is not up to date while the editor applies the person's own typing, so the highlight follows the
  // editor's own mapping for it: this is the case where a position resolved too early lands a character away.
  const typing = [
    { where: 'before it', at: 0 },
    { where: 'at its start', at: 2 },
    { where: 'inside it', at: 3 },
    { where: 'at its end', at: 4 },
    { where: 'after it', at: 6 },
  ]

  it.each(typing)('is on the characters the anchor resolves to when they type $where', ({ at }) => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    const thread = threadOn(editor, 'a', 'cd')
    showHighlights(editor, [thread], { handshaken: true })

    editor.commands.insertContentAt(1 + at, 'X')

    const bound = boundDocumentOf(editor.state)
    if (bound === null) throw new Error('not bound')
    const placed = placementOf(editor.state, 'a')
    expect(placed).toMatchObject({ status: 'placed', ...resolveAnchor(bound, thread.anchor) })
  })

  it('is still on the same characters after several keystrokes in the same paragraph', () => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    showHighlights(editor, [threadOn(editor, 'a', 'cd')], { handshaken: true })

    for (const [index, character] of [...'123'].entries()) editor.commands.insertContentAt(1 + index, character)

    expect(highlighted(editor)).toEqual(['cd'])
  })
})

/** Lets the highlight settle: it is read from Yjs once the editor has written the person's own typing there. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve))

/** What the highlight of a thread covers for this person, or the word `orphaned`. */
function shownBy(editor: Editor, id: string): string {
  const placement = placementOf(editor.state, id)
  return placement.status === 'placed'
    ? editor.state.doc.textBetween(placement.from, placement.to, ' ')
    : placement.status
}

/** What Yjs says the anchor covers in this editor's document: the truth, which the highlight has to end up as. */
function yjsSays(editor: Editor, anchor: HighlightedThread['anchor']): string {
  const bound = boundDocumentOf(editor.state)
  if (bound === null) throw new Error('not bound')
  const range = resolveAnchor(bound, anchor)
  return range === null ? 'orphaned' : editor.state.doc.textBetween(range.from, range.to, ' ')
}

describe('a thread whose text the person who sees it replaces or types at the edge of', () => {
  // The editor's own mapping gives the edge of a replaced range the side it likes, whatever the association of the end:
  // Yjs does not, and what the person ends up with has to be what everyone else sees.
  const replacements = [
    { what: 'the exact range, as after "Show in text"', from: 0, to: 0 },
    { what: 'the range and a character before it', from: -1, to: 0 },
    { what: 'the range and a character after it', from: 0, to: 1 },
    { what: 'the range and a character on each side', from: -1, to: 1 },
    { what: 'the start of the range and what is before it', from: -1, to: -1 },
    { what: 'the end of the range and what is after it', from: 1, to: 1 },
  ]

  it.each(replacements)('ends as Yjs says when they type over $what', async ({ from, to }) => {
    open = withHighlights('abcdefgh')
    const { editor } = open.local
    const thread = threadOn(editor, 'a', 'cdef')
    showHighlights(editor, [thread], { handshaken: true })
    const range = rangeOf(editor, 'cdef')

    editor.commands.insertContentAt({ from: range.from + from, to: range.to + to }, 'XY')
    await settle()

    expect(shownBy(editor, 'a')).toBe(yjsSays(editor, thread.anchor))
    expect(shownBy(editor, 'a')).toBe(yjsSays(open.remote.editor, thread.anchor))
  })

  it('is orphaned, for the person who typed as for the others, when they type over exactly the commented text', async () => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    const thread = threadOn(editor, 'a', 'cd')
    showHighlights(editor, [thread], { handshaken: true })

    editor.commands.setTextSelection(rangeOf(editor, 'cd'))
    editor.view.dispatch(editor.state.tr.insertText('X'))
    editor.view.dispatch(editor.state.tr.insertText('Y'))
    await settle()

    expect(placementOf(editor.state, 'a')).toEqual({ status: 'orphaned' })
    expect(yjsSays(open.remote.editor, thread.anchor)).toBe('orphaned')
  })

  it('covers what Yjs covers when they type where a range that cannot be tied to a character begins', async () => {
    // Protocol section 10.2: a range that starts at the end of a paragraph takes the text typed there.
    open = withHighlights('abc', 'def')
    const { editor } = open.local
    const bound = boundDocumentOf(editor.state)
    if (bound === null) throw new Error('not bound')
    const from = rangeOf(editor, 'abc').to
    const anchor = createAnchor(bound, from, rangeOf(editor, 'de').to)
    showHighlights(editor, [{ id: 'a', anchor }], { handshaken: true })

    editor.commands.insertContentAt(from, 'Z')
    await settle()

    expect(shownBy(editor, 'a')).toBe('Z de')
    expect(shownBy(editor, 'a')).toBe(yjsSays(open.remote.editor, anchor))
  })
})

describe('the threads that are shown', () => {
  it('are the open ones: a resolved thread has no highlight', () => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    const unresolved = threadOn(editor, 'a', 'ab')
    const resolved = threadOn(editor, 'b', 'ef')
    showHighlights(
      editor,
      highlightedThreads([
        { ...unresolved, status: 'open' },
        { ...resolved, status: 'resolved' },
      ]),
      { handshaken: true },
    )

    expect(highlighted(editor)).toEqual(['ab'])
    expect(placementOf(editor.state, 'b')).toEqual({ status: 'unresolved' })
  })

  it('are told apart from the resolved ones by the helpers the screen uses', () => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    const threads = [
      { ...threadOn(editor, 'a', 'ab'), status: 'open' as const },
      { ...threadOn(editor, 'b', 'ef'), status: 'resolved' as const },
    ]

    expect(highlightedThreads(threads).map(({ id }) => id)).toEqual(['a'])
    expect(resolvedThreads(threads).map(({ id }) => id)).toEqual(['b'])
  })

  it('place the resolved ones without highlighting them, so the margin can put their cards level with their text', () => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    const resolved = threadOn(editor, 'b', 'ef')
    showHighlights(editor, [], { handshaken: true, resolved: [resolved] })

    expect(placementOf(editor.state, 'b')).toEqual({ status: 'placed', ...rangeOf(editor, 'ef') })
    expect(editor.view.dom.querySelector('mark')).toBeNull()
  })

  it('leave a resolved thread out of what a click or the key reaches, whose text is as good as any other text', () => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    const resolved = threadOn(editor, 'b', 'ef')
    showHighlights(editor, [], { handshaken: true, resolved: [resolved] })

    expect(threadAt(editor.state, rangeOf(editor, 'ef').from, { caret: true })).toBeNull()
  })

  it('call a resolved thread whose text is gone orphaned, as an open one', () => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    const resolved = threadOn(editor, 'b', 'ef')
    const { from, to } = rangeOf(editor, 'ef')
    editor.commands.deleteRange({ from, to })

    showHighlights(editor, [], { handshaken: true, resolved: [resolved] })

    expect(placementOf(editor.state, 'b')).toEqual({ status: 'orphaned' })
  })

  it('are highlighted when the text is read-only, which is how a commenter has it', () => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    const thread = threadOn(editor, 'a', 'cd')
    editor.setEditable(false)

    showHighlights(editor, [thread], { handshaken: true })

    expect(highlighted(editor)).toEqual(['cd'])
  })

  it('make the highlight of the one that is active different from the others', () => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    showHighlights(editor, [threadOn(editor, 'a', 'ab'), threadOn(editor, 'b', 'ef')], {
      handshaken: true,
      activeThreadId: 'b',
    })

    const marks = [...editor.view.dom.querySelectorAll('mark')]
    expect(marks.map((mark) => [mark.textContent, mark.hasAttribute('data-active')])).toEqual([
      ['ab', false],
      ['ef', true],
    ])
  })

  it('is not written into the shared document', () => {
    open = withHighlights('abcdef')
    const { editor } = open.local
    const before = open.local.ydoc.getXmlFragment('default').toJSON()

    showHighlights(editor, [threadOn(editor, 'a', 'cd')], { handshaken: true })

    expect(open.local.ydoc.getXmlFragment('default').toJSON()).toBe(before)
  })
})

describe('opening a thread from the text', () => {
  const clickAt = (editor: Editor, position: number) =>
    editor.view.someProp('handleClick', (handler) => handler(editor.view, position, new MouseEvent('click')))
  const pressComment = (editor: Editor) =>
    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, altKey: true, bubbles: true, cancelable: true }),
    )

  function withRequests(...texts: string[]) {
    const requests = createCommentRequests()
    const sent: CommentRequest[] = []
    requests.subscribe((request) => sent.push(request))
    open = pairedEditors(document(...texts), [commentHighlights.configure({ requests })])
    const { editor } = open.local
    return { editor, sent }
  }

  it('shows the thread of a highlight that is clicked, and leaves the focus in the text', () => {
    const { editor, sent } = withRequests('abcdef')
    showHighlights(editor, [threadOn(editor, 'a', 'cd')], { handshaken: true })

    clickAt(editor, rangeOf(editor, 'cd').from + 1)

    expect(sent).toEqual([{ type: 'thread', threadId: 'a', focus: false }])
  })

  it('does not take a click outside every highlight, or at the end of one, for a thread', () => {
    const { editor, sent } = withRequests('abcdef')
    showHighlights(editor, [threadOn(editor, 'a', 'cd')], { handshaken: true })

    clickAt(editor, rangeOf(editor, 'ab').from)
    clickAt(editor, rangeOf(editor, 'cd').to)

    expect(sent).toEqual([])
  })

  it('takes the person to the thread when they press the key with the caret in a highlight, even at its end', () => {
    const { editor, sent } = withRequests('abcdef')
    showHighlights(editor, [threadOn(editor, 'a', 'cd')], { handshaken: true })

    editor.commands.setTextSelection(rangeOf(editor, 'cd').to)
    pressComment(editor)

    expect(sent).toEqual([{ type: 'thread', threadId: 'a', focus: true }])
  })

  it('starts a comment when they press the key with text selected, even inside a highlight', () => {
    const { editor, sent } = withRequests('abcdef')
    showHighlights(editor, [threadOn(editor, 'a', 'cd')], { handshaken: true })

    editor.commands.setTextSelection(rangeOf(editor, 'cd'))
    pressComment(editor)

    expect(sent).toEqual([{ type: 'comment' }])
  })

  it('goes to the narrowest thread where highlights overlap', () => {
    const { editor, sent } = withRequests('abcdef')
    showHighlights(editor, [threadOn(editor, 'wide', 'bcde'), threadOn(editor, 'narrow', 'cd')], { handshaken: true })

    clickAt(editor, rangeOf(editor, 'cd').from)

    expect(sent).toEqual([{ type: 'thread', threadId: 'narrow', focus: false }])
  })

  it("takes a commenter, whose text takes no edits, to the thread too: the key is not one of the editor's", () => {
    const { editor, sent } = withRequests('abcdef')
    showHighlights(editor, [threadOn(editor, 'a', 'cd')], { handshaken: true })
    editor.setEditable(false)

    editor.commands.setTextSelection(rangeOf(editor, 'cd').from + 1)
    pressComment(editor)

    expect(sent).toEqual([{ type: 'thread', threadId: 'a', focus: true }])
  })

  it('takes the key from the browser, which would do something of its own with it, and leaves every other key alone', () => {
    const { editor } = withRequests('abcdef')
    const press = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
      editor.view.dom.dispatchEvent(event)
      return event.defaultPrevented
    }

    expect(press({ key: 'm', ctrlKey: true, altKey: true })).toBe(true)
    expect(press({ key: 'm', ctrlKey: true })).toBe(false)
    expect(press({ key: 'm' })).toBe(false)
  })
})
