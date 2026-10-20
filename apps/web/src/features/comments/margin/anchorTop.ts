import type { Editor } from '@tiptap/core'

/** The height of a position of the text on the page, or `null` for one the text does not have. */
export function anchorTop(editor: Editor, position: number): number | null {
  if (position > editor.state.doc.content.size) return null
  try {
    return editor.view.coordsAtPos(position).top
  } catch {
    // The view has no layout to ask (it is not in the page, or a test has none), or the position went with a change that
    // has not reached whoever asks: it measures again with the next one.
    return null
  }
}
