import { editorExtensions, fragmentName } from '@draftroom/editor-schema'
import { Collaboration } from '@tiptap/extension-collaboration'
import { useEditor } from '@tiptap/react'
import type { EditorProps, EditorView } from '@tiptap/pm/view'
import { redo, undo } from '@tiptap/y-tiptap'
import { useEffect, useMemo } from 'react'
import type * as Y from 'yjs'
import { LinkShortcut } from './LinkShortcut.ts'
import { sanitizePastedHtml } from './sanitizePaste.ts'
import styles from './Prose.module.css'

export interface DocumentEditorOptions {
  ydoc: Y.Doc
  editable: boolean
  /** The accessible name of the text area, in the language of the app. */
  contentLabel: string
  /** Called with the address of the link the cursor is in (or `null`) when the person asks for the link dialog. */
  onLinkRequest: (currentHref: string | null) => void
}

/**
 * The editor of one open document: the shared schema, the content in the given Yjs document and nothing else. Undo is the
 * Collaboration extension's, which tracks only the changes made here.
 */
export function useDocumentEditor({ ydoc, editable, contentLabel, onLinkRequest }: DocumentEditorOptions) {
  const extensions = useMemo(
    () => [
      ...editorExtensions(),
      Collaboration.configure({ document: ydoc, field: fragmentName }),
      LinkShortcut.configure({ onRequest: onLinkRequest }),
    ],
    [ydoc, onLinkRequest],
  )

  // What the editor takes from the screen after it is made: who may type, and the name of the text area, which follows the
  // language. They change the editor that is there (`editorProps` through `setOptions`, which `useEditor` does when the
  // object changes, and `setEditable`), so a change of role or of language keeps the text, the selection and the undo
  // history, and does not bind Collaboration again.
  const editorProps = useMemo<EditorProps>(
    () => ({
      attributes: {
        class: styles.prose ?? '',
        role: 'textbox',
        'aria-label': contentLabel,
        'aria-multiline': 'true',
        'aria-readonly': String(!editable),
      },
      transformPastedHTML: sanitizePastedHtml,
      handleDOMEvents: { beforeinput: takeOverHistory },
    }),
    [contentLabel, editable],
  )

  // No dependencies: one editor for as long as the screen lives, which is as long as its Yjs document.
  const editor = useEditor({ extensions, editable, editorProps }, [])
  useEffect(() => {
    editor.setEditable(editable)
  }, [editor, editable])
  return editor
}

/**
 * The browser keeps an undo history of its own, and on Chromium `Ctrl+Z` in a field with nothing to undo (the title)
 * reaches the text area as `beforeinput` of type `historyUndo` and reverts the browser's last edit there, outside the
 * undo of Collaboration, which only reverts the person's own changes. The editor refuses the native undo and redo and,
 * when the person is in the text, does what its own keys do.
 */
function takeOverHistory(view: EditorView, event: Event): boolean {
  if (!(event instanceof InputEvent) || (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo')) {
    return false
  }
  event.preventDefault()
  if (view.hasFocus()) (event.inputType === 'historyUndo' ? undo : redo)(view.state)
  return true
}
