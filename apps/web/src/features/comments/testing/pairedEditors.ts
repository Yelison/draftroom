import { editorExtensions, fragmentName } from '@draftroom/editor-schema'
import { Editor, type Content, type Extensions } from '@tiptap/core'
import { Collaboration } from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import '../../editor/testing/jsdomShims.ts'

/** One person at one editor: their own Yjs document, bound to a real Tiptap editor. */
export interface Person {
  ydoc: Y.Doc
  editor: Editor
}

const personWith = (extensions: Extensions): Person => {
  const ydoc = new Y.Doc()
  const editor = new Editor({
    extensions: [
      ...editorExtensions(),
      Collaboration.configure({ document: ydoc, field: fragmentName }),
      ...extensions,
    ],
  })
  return { ydoc, editor }
}

/**
 * Two people on one document, each with a Yjs document of their own and the real editor over it, and the updates of each
 * carried to the other at once. What one types reaches the other the way it does through the collaboration server, which
 * is the case the anchors have to survive: a position made by one person and resolved by the other. The extensions are
 * the local person's own, the ones the screen adds to the editor.
 */
export function pairedEditors(content: Content, localExtensions: Extensions = []) {
  const local = personWith(localExtensions)
  const remote = personWith([])
  const carry = (from: Y.Doc, to: Y.Doc) =>
    from.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== 'carried') Y.applyUpdate(to, update, 'carried')
    })
  carry(local.ydoc, remote.ydoc)
  carry(remote.ydoc, local.ydoc)
  local.editor.commands.setContent(content)
  return {
    local,
    remote,
    destroy() {
      for (const { editor, ydoc } of [local, remote]) {
        editor.destroy()
        ydoc.destroy()
      }
    },
  }
}

/** Where `text` is in the editor's document, in ProseMirror positions: the range a person would select to comment on it. */
export function rangeOf(editor: Editor, text: string): { from: number; to: number } {
  let found: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, position) => {
    if (found !== null || !node.isText) return
    const index = (node.text ?? '').indexOf(text)
    if (index >= 0) found = { from: position + index, to: position + index + text.length }
  })
  if (found === null) throw new Error(`"${text}" is not in the document`)
  return found
}
