import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import { placementsOf } from './highlightPlugin.ts'

/**
 * Where each thread is in the text, as the highlights have it: the cards say what the text says, because both read it from
 * the plugin. The map is the same object until a thread moves, so a keystroke elsewhere renders nothing.
 */
export function usePlacements(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => placementsOf(current.state),
    equalityFn: Object.is,
  })
}
