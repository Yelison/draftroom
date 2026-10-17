import { editorExtensions } from '@draftroom/editor-schema'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { useEditor } from '@tiptap/react'
import type { Slice } from '@tiptap/pm/model'
import type { EditorProps, EditorView } from '@tiptap/pm/view'
import { redo, undo } from '@tiptap/y-tiptap'
import { useEffect, useMemo, useRef } from 'react'
import type * as Y from 'yjs'
import type { CommentRequests } from '../comments/commentRequests.ts'
import { commentHighlights } from '../comments/highlightPlugin.ts'
import { collaborationExtensions, type CollaboratingPerson } from './CollaborationExtensions.ts'
import { LinkShortcut } from './LinkShortcut.ts'
import { updateBytesOf } from './pasteBudget.ts'
import { sanitizePastedHtml } from './sanitizePaste.ts'
import styles from './Prose.module.css'

export interface DocumentEditorOptions {
  ydoc: Y.Doc
  provider: HocuspocusProvider
  /** Who is writing, for the caret the others see. */
  person: CollaboratingPerson
  /** Whether the text accepts edits: the connection and the person's role decide, not the screen. */
  editable: boolean
  /** Whether content that would add this many bytes to the Yjs update still fits what may be unsent (protocol section 12.5). */
  hasRoomFor: (bytes: number) => boolean
  /** Called when a paste or a drop was refused because it did not fit. */
  onTooLarge: () => void
  /** The accessible name of the text area, in the language of the app. */
  contentLabel: string
  /** Called with the address of the link the cursor is in (or `null`) when the person asks for the link dialog. */
  onLinkRequest: (currentHref: string | null) => void
  /** Where the text sends what the person does to a comment highlight: a click on it, or the key that opens its thread. */
  commentRequests: CommentRequests
}

/**
 * The editor of one open document: the shared schema, the content in the given Yjs document and the carets of the people
 * in it. Undo is the Collaboration extension's, which tracks only the changes made here.
 */
export function useDocumentEditor({
  ydoc,
  provider,
  person,
  editable,
  hasRoomFor,
  onTooLarge,
  contentLabel,
  onLinkRequest,
  commentRequests,
}: DocumentEditorOptions) {
  const extensions = useMemo(
    () => [
      ...editorExtensions(),
      ...collaborationExtensions({ ydoc, provider, person }),
      LinkShortcut.configure({ onRequest: onLinkRequest }),
      commentHighlights.configure({ requests: commentRequests }),
    ],
    [ydoc, provider, person, onLinkRequest, commentRequests],
  )

  // The handlers are made once with the editor and read what is current through this, as the editor's props do below.
  const budget = useRef<Budget>({ hasRoomFor, onTooLarge })
  useEffect(() => {
    budget.current = { hasRoomFor, onTooLarge }
  })

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
        // A text that takes no edits is not a field, so nothing would put the focus in it: a reader or a commenter has to
        // be able to come back to it from a comment, and to move through it with the keyboard.
        ...(editable ? {} : { tabindex: '0' }),
      },
      transformPastedHTML: sanitizePastedHtml,
      handleDOMEvents: { beforeinput: takeOverHistory },
      // Both run on the slice after it was sanitised. Refusing says so, rather than inserting a part of it.
      handlePaste: (view, _event, slice) => refuseWhenTooLarge(budget.current, view, slice),
      // Moving what is already in the text adds nothing to what is unsent.
      handleDrop: (view, _event, slice, moved) => !moved && refuseWhenTooLarge(budget.current, view, slice),
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

interface Budget {
  hasRoomFor: (bytes: number) => boolean
  onTooLarge: () => void
}

/** Whether the content has to be refused, which it is when its update does not fit; the person is told. */
function refuseWhenTooLarge({ hasRoomFor, onTooLarge }: Budget, view: EditorView, slice: Slice): boolean {
  if (hasRoomFor(updateBytesOf(slice, view.state.schema))) return false
  onTooLarge()
  return true
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
