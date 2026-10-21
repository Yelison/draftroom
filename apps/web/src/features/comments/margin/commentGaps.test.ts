import type { Editor } from '@tiptap/core'
import { yUndoPluginKey } from '@tiptap/y-tiptap'
import { afterEach, describe, expect, it } from 'vitest'
import { pairedEditors } from '../testing/pairedEditors.ts'
import { commentGaps, setCommentGaps } from './commentGaps.ts'

let open: ReturnType<typeof withGaps> | null = null
afterEach(() => open?.destroy())

const document = (...texts: string[]) => ({
  type: 'doc',
  content: texts.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
})

const withGaps = (...texts: string[]) => pairedEditors(document(...texts), [commentGaps])

/** The gap each top-level block of the text carries, `null` for a block with none. */
const gapsOf = (editor: Editor) =>
  [...editor.view.dom.children].map((block) => block.getAttribute('data-comment-gap') ?? null)

describe('the gaps the text opens for the comments of the margin', () => {
  it('has none until it is told to open one', () => {
    open = withGaps('one', 'two', 'three')

    expect(gapsOf(open.local.editor)).toEqual([null, null, null])
  })

  it('opens the gap after the block it is given, as a measure the stylesheet turns into room', () => {
    open = withGaps('one', 'two', 'three')
    const { editor } = open.local

    setCommentGaps(editor, new Map([[1, 38]]))

    expect(gapsOf(editor)).toEqual([null, '38', null])
    expect((editor.view.dom.children[1] as HTMLElement).style.getPropertyValue('--comment-gap')).toBe('38px')
  })

  it('closes a gap that is no longer asked for', () => {
    open = withGaps('one', 'two')
    const { editor } = open.local
    setCommentGaps(editor, new Map([[0, 20]]))

    setCommentGaps(editor, new Map())

    expect(gapsOf(editor)).toEqual([null, null])
  })

  it('keeps a gap with its block when text is typed in front of it, until the margin measures again', () => {
    open = withGaps('one', 'two')
    const { editor } = open.local
    setCommentGaps(editor, new Map([[1, 20]]))

    editor.commands.insertContentAt(1, 'zero ')

    expect(gapsOf(editor)).toEqual([null, '20'])
  })

  it('changes nothing in the document: a gap is drawn, not written', () => {
    open = withGaps('one', 'two')
    const { editor } = open.local
    const before = editor.getJSON()

    setCommentGaps(editor, new Map([[0, 20]]))

    expect(editor.getJSON()).toEqual(before)
  })

  it('is not an undo step', () => {
    open = withGaps('one', 'two')
    const { editor } = open.local
    const steps = () => yUndoPluginKey.getState(editor.state)?.undoManager.undoStack.length

    const before = steps()
    setCommentGaps(editor, new Map([[0, 20]]))

    expect(steps()).toBe(before)
  })
})
