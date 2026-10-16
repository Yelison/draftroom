import { useEffect, useRef, type RefObject } from 'react'
import { focusMainContent } from '../../app/mainContent.ts'

const focusRow = (list: HTMLUListElement | null, index: number) =>
  list?.children[index]?.querySelector('button')?.focus()

/**
 * Where the focus goes when the list changes under it. A row that leaves takes the focus with it, so the first button of
 * the row that takes its place has it, or the last row's when it was the last, or the headline when none is left. "Load
 * more" is gone once the last page is in, and the focus goes to the first row that arrived.
 *
 * `ids` must keep its identity until the list changes, or the effect would run on every render.
 */
export function useTrashFocus(list: RefObject<HTMLUListElement | null>, ids: readonly string[]) {
  const leaving = useRef<{ id: string; index: number } | null>(null)
  const firstArrival = useRef<number | null>(null)

  // Runs once the list has changed, which is when the row is gone: the server's answer comes first and the list after it.
  useEffect(() => {
    if (leaving.current !== null && !ids.includes(leaving.current.id)) {
      const row = Math.min(leaving.current.index, ids.length - 1)
      if (row < 0) focusMainContent()
      else focusRow(list.current, row)
    }
    leaving.current = null
    if (firstArrival.current !== null && ids.length > firstArrival.current) {
      focusRow(list.current, firstArrival.current)
      firstArrival.current = null
    }
  }, [ids, list])

  return {
    /** The row of this document is about to leave the list. */
    leaving: (id: string) => void (leaving.current = { id, index: ids.indexOf(id) }),
    /** A page of the list was asked for. */
    loadingMore: () => void (firstArrival.current = ids.length),
  }
}
