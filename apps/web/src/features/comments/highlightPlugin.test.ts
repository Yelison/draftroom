import type { Editor } from '@tiptap/core'
import { yUndoPluginKey } from '@tiptap/y-tiptap'
import { afterEach, describe, expect, it } from 'vitest'
import { boundDocumentOf, createAnchor, resolveAnchor } from './anchors.ts'
import { createCommentRequests, type CommentRequest } from './commentRequests.ts'
import {
  commentHighlights,
  highlightedThreads,
  placementOf,
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
})
