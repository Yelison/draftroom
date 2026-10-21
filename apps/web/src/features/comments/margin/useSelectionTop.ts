import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import type { RefObject } from 'react'
import { anchorTop } from './anchorTop.ts'

/** How far down the margin the selection of the text starts, for the button that comments on it; `null` with no selection. */
export function useSelectionTop(editor: Editor, margin: RefObject<HTMLElement | null>): number | null {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => {
      // Asked after every transaction, typing included: the page is measured only when there is a selection to put a button by.
      const { from, empty } = current.state.selection
      if (empty || margin.current === null) return null
      const top = anchorTop(current, from)
      return top === null ? null : Math.round(top - margin.current.getBoundingClientRect().top)
    },
  })
}
