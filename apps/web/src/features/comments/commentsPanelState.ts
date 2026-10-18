import { createContext, use, useCallback, useMemo, useState } from 'react'

export interface CommentsPanelState {
  /** Whether the panel is beside the sheet. A closed panel stays mounted: the highlights and the comment being written are its. */
  open: boolean
  /** The person's own choice, which is remembered on this browser. */
  toggle(): void
  /** Opens it because the text asked for a thread, which is not a choice about the layout: it is not remembered. */
  show(): void
}

/** What the button that opens and closes the panel controls: there is one panel in a page. */
export const commentsPanelId = 'comments-panel'

/** Where this browser remembers the choice. */
const storageKey = 'draftroom.commentsPanel'

// Beside the panel the sheet is 504 px wide at 1280 and 664 px at 1440, so below 1440 it starts closed: the sheet is
// the page's subject, and a person who wants the comments there opens them. Deciding it from the threads that exist
// would move the sheet when they arrive; the width of the window is known on the first render.
const narrowWindow = '(width < 1440px)'

function readChoice(): boolean | null {
  try {
    const stored = localStorage.getItem(storageKey)
    return stored === 'open' ? true : stored === 'closed' ? false : null
  } catch {
    return null
  }
}

function rememberChoice(open: boolean): void {
  try {
    localStorage.setItem(storageKey, open ? 'open' : 'closed')
  } catch {
    // Private mode or blocked storage: the panel still changes, it is just not remembered.
  }
}

/** The state of the panel, for the layout that holds the editor to keep and to hand down with `CommentsPanelContext`. */
export function useCommentsPanelState(): CommentsPanelState {
  const [open, setOpen] = useState(() => readChoice() ?? !window.matchMedia(narrowWindow).matches)

  const toggle = useCallback(() => {
    const next = !open
    rememberChoice(next)
    setOpen(next)
  }, [open])
  const show = useCallback(() => setOpen(true), [])

  return useMemo(() => ({ open, toggle, show }), [open, toggle, show])
}

export const CommentsPanelContext = createContext<CommentsPanelState | null>(null)

/** The panel of the layout the editor is in. Only the layout that holds an editor provides it. */
export function useCommentsPanel(): CommentsPanelState {
  const state = use(CommentsPanelContext)
  if (state === null) throw new Error('The comments panel belongs to the layout of the editor')
  return state
}
