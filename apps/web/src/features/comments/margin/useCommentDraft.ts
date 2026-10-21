import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useState } from 'react'
import { boundDocumentOf, createAnchor, quoteOf, resolveAnchor } from '../anchors.ts'
import type { Draft } from '../NewThreadComposer.tsx'

/**
 * The comment being written: what it is about, what is written so far and where the text is that it is about. Asking for a
 * comment again while one is open makes it about the new selection and keeps what was written, because that belongs to the
 * person and not to the selection.
 */
export function useCommentDraft({
  editor,
  mayComment,
  onQuoteChanged,
  onStarted,
}: {
  editor: Editor
  mayComment: boolean
  /** Said when the comment that was open is now about something else: asking for the same selection changes nothing to say. */
  onQuoteChanged: () => void
  onStarted: () => void
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  // Counted, so each request puts the focus in the form again, also when it was already open.
  const [focusRequest, setFocusRequest] = useState(0)

  // Where the comment is on the text, which its anchor says: what is typed meanwhile moves it. `null` for none, and for a text
  // that is gone.
  const from = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const bound = boundDocumentOf(current.state)
      if (draft === null || bound === null) return null
      return resolveAnchor(bound, draft.anchor)?.from ?? null
    },
  })

  function start() {
    const selection = editor.state.selection
    const bound = boundDocumentOf(editor.state)
    if (selection.empty || bound === null || !mayComment) return
    const quote = quoteOf(editor.state.doc, selection.from, selection.to)
    if (quote.trim() === '') return
    const anchor = createAnchor(bound, selection.from, selection.to)
    setDraft((current) => ({ anchor, quote, body: current?.body ?? '' }))
    if (draft !== null && (draft.anchor.start !== anchor.start || draft.anchor.end !== anchor.end)) onQuoteChanged()
    setFocusRequest((count) => count + 1)
    onStarted()
  }

  return {
    draft,
    from,
    focusRequest,
    start,
    write: (body: string) => setDraft((current) => (current === null ? null : { ...current, body })),
    end: () => setDraft(null),
  }
}
