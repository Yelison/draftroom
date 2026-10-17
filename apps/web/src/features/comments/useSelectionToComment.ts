import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { quoteOf } from './anchors.ts'

/** The text the person has selected, if there is any worth commenting on: its range and the quote the thread would carry. */
export interface SelectedText {
  from: number
  to: number
  quote: string
}

export function useSelectionToComment(editor: Editor): SelectedText | null {
  return useEditorState({
    editor,
    selector: ({ editor: current }): SelectedText | null => {
      const { from, to, empty } = current.state.selection
      if (empty) return null
      const quote = quoteOf(current.state.doc, from, to)
      // A selection of only a node or only blanks has no text to quote, and a quote cannot be empty.
      return quote.trim() === '' ? null : { from, to, quote }
    },
  })
}
