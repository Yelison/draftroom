import { useEffect, useRef, type RefObject } from 'react'

/** Gives the focus to the first `selector` match inside the row at `index` of the list, if there is one. */
export function focusRow(list: HTMLUListElement | null, index: number, selector: string) {
  list?.children[index]?.querySelector<HTMLElement>(selector)?.focus()
}

/**
 * Keeps the focus from being lost when "Load more" goes away. That button is gone once the last page is in, and with it
 * the focus: it goes to the first row that arrived, to the first `selector` match inside that row.
 *
 * Call the returned function when the page is asked for. `count` is the number of rows the list has, and the focus moves
 * once it grows beyond what it was then, which is when the page is in.
 */
export function useFocusFirstArrival(list: RefObject<HTMLUListElement | null>, count: number, selector: string) {
  const firstArrival = useRef<number | null>(null)

  useEffect(() => {
    if (firstArrival.current === null || count <= firstArrival.current) return
    focusRow(list.current, firstArrival.current, selector)
    firstArrival.current = null
  }, [count, list, selector])

  return () => void (firstArrival.current = count)
}
