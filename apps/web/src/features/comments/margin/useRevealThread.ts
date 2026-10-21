import type { Schema } from '@draftroom/contract'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Placement } from '../highlightPlugin.ts'
import type { ThreadFilterValue } from '../ThreadFilter.tsx'

/** A thread asked for: scrolled to, and, when it was asked for from the keyboard or by choosing it, given the focus. */
interface Reveal {
  threadId: string
  focus: boolean
  /** Counted, so asking for the same thread twice shows it twice. */
  count: number
}

/**
 * Shows a thread when the text asks for it or the person chooses it: its card is brought into view and, if asked, given the
 * focus. A filter that hides it is changed first, so the person is never told to look for something they cannot see. It
 * waits for the text to have placed the thread: a thread moves from the end of the margin to its place on the text then, and
 * that is another element, so the focus would go with the one that was there.
 */
export function useRevealThread({
  list,
  threads,
  filter,
  onFilter,
  placements,
  handshaken,
}: {
  list: RefObject<HTMLElement | null>
  threads: readonly Schema<'Thread'>[]
  filter: ThreadFilterValue
  onFilter: (filter: ThreadFilterValue) => void
  placements: ReadonlyMap<string, Placement>
  handshaken: boolean
}) {
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const done = useRef<Reveal | null>(null)

  useEffect(() => {
    if (reveal === null || done.current === reveal) return
    const thread = threads.find((row) => row.id === reveal.threadId)
    if (thread === undefined) return
    const placement = placements.get(thread.id)
    if (handshaken && (placement === undefined || placement.status === 'unresolved')) return
    if (filter !== 'all' && thread.status !== filter) {
      // A request from the text is the one reason to leave the filter the person chose.
      // oxlint-disable-next-line react/set-state-in-effect
      onFilter(thread.status)
      return
    }
    const card = list.current?.querySelector<HTMLElement>(`[data-thread-id="${CSS.escape(reveal.threadId)}"]`)
    if (card === null || card === undefined) return
    done.current = reveal
    if (reveal.focus) card.focus({ preventScroll: true })
    // The margin puts the card level with its text in the layout of this render, which the browser has not applied yet.
    requestAnimationFrame(() => card.scrollIntoView({ block: 'nearest' }))
    // A request is acted on once; the threads and the filter it waits for re-run it until the card is there.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [reveal, threads, filter, placements, handshaken])

  return useCallback(
    (threadId: string, { focus }: { focus: boolean }) =>
      setReveal((previous) => ({ threadId, focus, count: (previous?.count ?? 0) + 1 })),
    [],
  )
}
