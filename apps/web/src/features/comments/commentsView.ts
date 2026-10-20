import { createContext, use, useCallback, useMemo, useState } from 'react'
import type { ThreadFilterValue } from './ThreadFilter.tsx'

/** What the bar over the sheet says about the comments: which threads to show, and whether the margin is beside the text. */
export type CommentsTab = 'comments' | 'activity'

export interface CommentsView {
  filter: ThreadFilterValue
  setFilter(filter: ThreadFilterValue): void
  /** `activity` puts the list of what happened to the document at the edge of the window; `comments` leaves only the margin. */
  tab: CommentsTab
  setTab(tab: CommentsTab): void
  /** The thread the person is on, for the document they have open: another document has other threads. */
  activeThreadId(documentId: string): string | null
  setActiveThread(documentId: string, threadId: string | null): void
  /** Whether the margin is beside the text. A hidden margin stays mounted: the highlights and a comment being written are its. */
  marginShown: boolean
  /** The person's own choice, which is remembered on this browser. */
  toggleMargin(): void
  /** Shows it because the text asked for a thread, which is not a choice about the layout: it is not remembered. */
  showMargin(): void
}

/** What the button that shows and hides the margin controls: there is one margin in a page. */
export const commentsMarginId = 'comments-margin'

/** Where this browser remembers the choice. */
const storageKey = 'draftroom.commentsMargin'

// With the margin beside it the text is 566 px wide at 1280 and 708 at 1440: below 1440 it starts hidden, so that the text
// is the page's subject and a person who wants the comments there shows them. Deciding it from the threads that exist would
// move the text when they arrive; the width of the window is known on the first render.
const narrowWindow = '(width < 1440px)'

function readChoice(): boolean | null {
  try {
    const stored = localStorage.getItem(storageKey)
    return stored === 'shown' ? true : stored === 'hidden' ? false : null
  } catch {
    return null
  }
}

function rememberChoice(shown: boolean): void {
  try {
    localStorage.setItem(storageKey, shown ? 'shown' : 'hidden')
  } catch {
    // Private mode or blocked storage: the margin still changes, it is just not remembered.
  }
}

/**
 * The state of the comments of the layout that holds the editor, which outlasts the document screen: going to the history of
 * the document and coming back finds the thread, the filter and the tab as they were. It knows nothing of the editor, so the
 * layout can hold it without the editor being in the first load.
 */
export function useCommentsViewState(): CommentsView {
  const [filter, setFilter] = useState<ThreadFilterValue>('open')
  const [tab, setTab] = useState<CommentsTab>('comments')
  const [active, setActive] = useState<{ documentId: string; threadId: string | null } | null>(null)
  const [marginShown, setMarginShown] = useState(() => readChoice() ?? !window.matchMedia(narrowWindow).matches)

  const activeThreadId = useCallback(
    (documentId: string) => (active?.documentId === documentId ? active.threadId : null),
    [active],
  )
  const setActiveThread = useCallback(
    (documentId: string, threadId: string | null) => setActive({ documentId, threadId }),
    [],
  )
  const toggleMargin = useCallback(() => {
    const next = !marginShown
    rememberChoice(next)
    setMarginShown(next)
  }, [marginShown])
  const showMargin = useCallback(() => setMarginShown(true), [])

  return useMemo(
    () => ({
      filter,
      setFilter,
      tab,
      setTab,
      activeThreadId,
      setActiveThread,
      marginShown,
      toggleMargin,
      showMargin,
    }),
    [filter, tab, activeThreadId, setActiveThread, marginShown, toggleMargin, showMargin],
  )
}

export const CommentsViewContext = createContext<CommentsView | null>(null)

/** The comments of the layout the editor is in. Only the layout that holds an editor provides it. */
export function useCommentsView(): CommentsView {
  const state = use(CommentsViewContext)
  if (state === null) throw new Error('The comments belong to the layout of the editor')
  return state
}
