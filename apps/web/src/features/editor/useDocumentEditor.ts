import { editorExtensions, fragmentName } from '@draftroom/editor-schema'
import { Collaboration } from '@tiptap/extension-collaboration'
import { useEditor } from '@tiptap/react'
import { useMemo } from 'react'
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

  // The editor is made again when one of these changes: `useEditor` reads its options when it creates the editor, and
  // the content is in the Yjs document, so a new editor opens on the same text.
  return useEditor(
    {
      extensions,
      editable,
      editorProps: {
        attributes: {
          class: styles.prose ?? '',
          role: 'textbox',
          'aria-label': contentLabel,
          'aria-multiline': 'true',
          'aria-readonly': String(!editable),
        },
        transformPastedHTML: sanitizePastedHtml,
      },
    },
    [extensions, editable, contentLabel],
  )
}
