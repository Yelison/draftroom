import { useEffect, useRef, type RefObject } from 'react'

interface Plan {
  threadId: string
  index: number
}

const cardsIn = (list: HTMLElement | null) => [...(list?.querySelectorAll<HTMLElement>('[data-thread-id]') ?? [])]

/**
 * Where the focus goes when what had it is gone. A card leaves the list when its thread is resolved or reopened under a
 * filter that no longer shows it, or when its last comment is deleted, and the button that was pressed goes with it: the
 * focus would fall to the page. The plan is made when the person acts and carried out when the threads change, which is
 * when the page has what it will show: the thread's own card if it is still there, otherwise the card that took its place or
 * the one before it, and the fallback when the list is empty. If the focus is somewhere else by then the person has moved on,
 * and it stays.
 *
 * `signature` is what makes the threads on the page different from before: nothing is carried out until it changes.
 */
export function useFocusPlan(
  list: RefObject<HTMLElement | null>,
  fallback: RefObject<HTMLElement | null>,
  signature: string,
) {
  const plan = useRef<Plan | null>(null)

  useEffect(() => {
    const current = plan.current
    if (current === null) return
    const cards = cardsIn(list.current)
    plan.current = null
    if (document.activeElement !== document.body && document.activeElement !== null) return
    const own = cards.find((row) => row.dataset['threadId'] === current.threadId)
    ;(own ?? cards[current.index] ?? cards[current.index - 1] ?? fallback.current)?.focus()
    // The signature is the trigger; the plan and the refs are read when it fires.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [signature])

  return {
    keepFocusAround(threadId: string) {
      const index = cardsIn(list.current).findIndex((row) => row.dataset['threadId'] === threadId)
      plan.current = { threadId, index }
    },
  }
}
