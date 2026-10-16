import { useEffect, useRef, type RefObject } from 'react'

/** Gives the focus to the first `selector` match inside the row at `index` of the list, if there is one. */
export function focusRow(list: HTMLUListElement | null, index: number, selector: string) {
  list?.children[index]?.querySelector<HTMLElement>(selector)?.focus()
}

interface Mark {
  /** The ids the list had when the page was asked for. */
  ids: ReadonlySet<string>
  /** What had the focus then: "Load more", which goes away with the last page. */
  asked: Element | null
  /** The query the page was asked for. */
  query: string
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
 * That is told by the length alone, so a reload that swaps rows for others of the same count reads as an empty page.
 *
 * Two rules keep it from taking the focus from the person:
 * - It follows the page asked for `query` (the workspace, the folder and the search, as one string), and gives up when
 *   `query` changes: the rows of another query are not that page.
 * - It moves the focus only if it is still where the page was asked for, or lost (on `body`, or on a node that is no
 *   longer in the document). Anywhere else the person went on, and the page arrives without taking the focus.
 *
 * `ids` must keep its identity until the list changes, or the effect would run on every render.
 */
export function useFocusFirstArrival(
  list: RefObject<HTMLUListElement | null>,
  ids: readonly string[],
  selector: string,
  query: string,
) {
  const mark = useRef<Mark | null>(null)

  useEffect(() => {
    const asked = mark.current
    if (asked === null) return
    if (asked.query !== query) {
      mark.current = null
      return
    }

    const firstArrival = ids.findIndex((id) => !asked.ids.has(id))
    if (firstArrival >= 0) {
      if (isLostOrAt(asked.asked)) focusRow(list.current, firstArrival, selector)
      mark.current = null
    } else if (ids.length < asked.ids.size) {
      mark.current = { ...asked, ids: new Set(ids) }
    } else {
      mark.current = null
    }
  }, [ids, list, selector, query])

  return () => void (mark.current = { ids: new Set(ids), asked: document.activeElement, query })
}

/** Whether the focus is on `element`, or nowhere: on `body`, or on a node that is gone. */
function isLostOrAt(element: Element | null) {
  const focused = document.activeElement
  return focused === null || focused === document.body || focused === element || !focused.isConnected
}
