import { useEffect, useEffectEvent, useRef, type FocusEventHandler, type RefObject } from 'react'

/**
 * Keeps the focus from falling to the page when the row that has it leaves the section: a document that is pinned (it moves
 * to "Pinned"), moved to another folder or archived is gone from the list a moment after the person acted on it. The
 * focus goes to the row that took its place, or to the one before it when it was the last, or to `fallback` when none is left.
 *
 * Spread the returned handler on the list: it remembers which row had the focus. Nothing is moved when the focus is
 * somewhere else by then, since the person went on.
 */
export function useFocusAfterRemoval(
  list: RefObject<HTMLUListElement | null>,
  ids: readonly string[],
  fallback: () => HTMLElement | null,
) {
  const lastFocused = useRef<{ id: string; index: number } | null>(null)
  const findFallback = useEffectEvent(fallback)

  useEffect(() => {
    const row = lastFocused.current
    if (row === null || ids.includes(row.id)) return
    lastFocused.current = null
    const focused = document.activeElement
    if (focused !== null && focused !== document.body) return
    const successor = list.current?.children[Math.min(row.index, ids.length - 1)]
    const target = successor?.querySelector<HTMLElement>('a') ?? findFallback()
    target?.focus()
  }, [ids, list])

  const onFocus: FocusEventHandler<HTMLUListElement> = (event) => {
    const items = [...event.currentTarget.children]
    const index = items.findIndex((item) => item.contains(event.target))
    const id = ids[index]
    lastFocused.current = id === undefined ? null : { id, index }
  }
  return onFocus
}
