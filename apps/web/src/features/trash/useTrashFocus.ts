import { useEffect, useRef, type RefObject } from 'react'
import { focusMainContent } from '../../app/mainContent.ts'
import { focusRow, useFocusFirstArrival } from '../documents/useFocusFirstArrival.ts'

const rowAction = 'button'

/**
 * Where the focus goes when the list changes under it. A document that leaves takes the focus with it, so the row that
 * is selected now has it, or the headline when none is left. "Load more" is gone once the last page is in, and the
 * focus goes to the first row that arrived.
 *
 * `ids` must keep its identity until the list changes, or the effect would run on every render.
 */
export function useTrashFocus(
  list: RefObject<HTMLUListElement | null>,
  ids: readonly string[],
  selectedIndex: number,
  workspaceId: string,
) {
  const leaving = useRef<string | null>(null)

  // Runs once the list has changed, which is when the row is gone: the server's answer comes first and the list after it.
  useEffect(() => {
    if (leaving.current !== null && !ids.includes(leaving.current)) {
      if (ids.length === 0) focusMainContent()
      else focusRow(list.current, selectedIndex, rowAction)
    }
    leaving.current = null
  }, [ids, list, selectedIndex])

  // Declared after the effect above: a row that leaves is given the focus before a page that arrives, as when they were one.
  const loadingMore = useFocusFirstArrival(list, ids, rowAction, workspaceId)

  return {
    /** The row of this document is about to leave the list. */
    leaving: (id: string) => void (leaving.current = id),
    /** A page of the list was asked for. */
    loadingMore,
  }
}
