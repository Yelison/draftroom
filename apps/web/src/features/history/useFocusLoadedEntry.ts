import { useEffect, useRef, type RefObject } from 'react'
import type { TimelineEntry } from './renameBursts.ts'

interface Mark {
  /** How many events each entry had when the page was asked for. */
  sizes: ReadonlyMap<string, number>
  /** What had the focus then: "Load more", which goes away with the last page. */
  focused: Element | null
  /** What the list was asked for. */
  listKey: string
}

const sizeOf = (entry: TimelineEntry): number => (entry.kind === 'event' ? 1 : entry.events.length)

const sizesOf = (entries: readonly TimelineEntry[]) => new Map(entries.map((entry) => [entry.key, sizeOf(entry)]))

/** Whether the focus is on `element`, or nowhere: a node that leaves the document hands it to `body`. */
function isLostOrAt(element: Element | null) {
  const focused = document.activeElement
  return focused === null || focused === document.body || focused === element
}

/**
 * Keeps the focus from being lost when "Load more" goes away, which it does with the last page: the focus goes to the
 * first entry the page brought, to its link or its button. An entry is new when its key was not there, or when it has
 * more events than it had, which is how the first events of a page look when they join a burst the last page began.
 *
 * Call the returned function when the page is asked for. The focus moves only if it is still where the page was asked
 * for, or lost; anywhere else the person went on. It follows what the list was asked for (`listKey`): the entries of
 * another list are not that page. The shared hook of the lists cannot do this, since it counts the rows that are the
 * children of one list and the timeline's are inside days inside weeks.
 */
export function useFocusLoadedEntry(
  root: RefObject<HTMLElement | null>,
  entries: readonly TimelineEntry[],
  listKey: string,
) {
  const mark = useRef<Mark | null>(null)

  useEffect(() => {
    const pending = mark.current
    if (pending === null) return
    if (pending.listKey !== listKey) {
      mark.current = null
      return
    }

    const arrival = entries.find((entry) => (pending.sizes.get(entry.key) ?? 0) < sizeOf(entry))
    if (arrival !== undefined) {
      if (isLostOrAt(pending.focused)) {
        root.current?.querySelector(`[data-entry="${arrival.key}"]`)?.querySelector<HTMLElement>('a, button')?.focus()
      }
      mark.current = null
    } else if (entries.length < pending.sizes.size) {
      // An entry left while the page was on its way: it has not come yet.
      mark.current = { ...pending, sizes: sizesOf(entries) }
    } else {
      mark.current = null
    }
  }, [entries, listKey, root])

  return () => void (mark.current = { sizes: sizesOf(entries), focused: document.activeElement, listKey })
}
