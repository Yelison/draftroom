import { useEffect, useRef, type RefObject } from 'react'

/** Gives the focus to the first `selector` match inside the row at `index` of the list, if there is one. */
export function focusRow(list: HTMLUListElement | null, index: number, selector: string) {
  list?.children[index]?.querySelector<HTMLElement>(selector)?.focus()
}

/**
 * Keeps the focus from being lost when "Load more" goes away. That button is gone once the last page is in, and with it
 * the focus: it goes to the first row that arrived, to the first `selector` match inside that row.
 *
 * Call the returned function when the page is asked for. `ids` are the ids of the rows, in order, and the hook follows
 * the rows by identity, not by how many there are: a row can leave while the page is on its way, and then the count
 * says nothing about which rows are new. The focus goes to the first id that was not there when the page was asked for.
 * When the ids change and none is new, either a row left and the page is still on its way, so the hook keeps waiting, or
 * the page came in empty, so it gives up without moving the focus and later rows that nobody asked for do not take it.
 *
 * `ids` must keep its identity until the list changes, or the effect would run on every render.
 */
export function useFocusFirstArrival(
  list: RefObject<HTMLUListElement | null>,
  ids: readonly string[],
  selector: string,
) {
  const before = useRef<ReadonlySet<string> | null>(null)

  useEffect(() => {
    if (before.current === null) return
    const firstArrival = ids.findIndex((id) => !before.current?.has(id))
    if (firstArrival >= 0) {
      focusRow(list.current, firstArrival, selector)
      before.current = null
    } else if (ids.length < before.current.size) {
      before.current = new Set(ids)
    } else {
      before.current = null
    }
  }, [ids, list, selector])

  return () => void (before.current = new Set(ids))
}
