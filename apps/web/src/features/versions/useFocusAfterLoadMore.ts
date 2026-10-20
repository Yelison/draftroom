import { useEffect, useRef, type RefObject } from 'react'

interface Mark {
  /** The ids of the versions that were shown when the page was asked for. */
  ids: ReadonlySet<string>
  /** What had the focus then: "Load more", which goes away with the last page. */
  focused: Element | null
}

export interface FocusAfterLoadMore {
  /** The element that holds the version buttons, each marked with `data-version-id`. */
  panel: RefObject<HTMLElement | null>
  /** The ids of the versions that are shown, in order. They must keep their identity until the list changes. */
  ids: readonly string[]
  /** The next page is on its way. */
  loading: boolean
  hasMore: boolean
  /** Where the focus goes when the page brought nothing to show and "Load more" is gone with it. */
  fallback: RefObject<HTMLElement | null>
}

/**
 * Keeps the focus from being lost when "Load more" goes away. It goes to the first version the page brought, and, when
 * everything the last page held is hidden (automatic versions), to `fallback`: the control that shows them.
 *
 * Call the returned function when the page is asked for. It moves the focus only if it is still on the button or lost
 * (on `body`): anywhere else the person went on, and the page arrives without taking it.
 */
export function useFocusAfterLoadMore({ panel, ids, loading, hasMore, fallback }: FocusAfterLoadMore) {
  const mark = useRef<Mark | null>(null)

  useEffect(() => {
    const pending = mark.current
    if (pending === null || loading) return
    mark.current = null

    const active = document.activeElement
    if (active !== null && active !== document.body && active !== pending.focused) return

    const arrival = ids.find((id) => !pending.ids.has(id))
    if (arrival !== undefined) {
      const buttons = panel.current?.querySelectorAll<HTMLElement>('[data-version-id]') ?? []
      for (const button of buttons) if (button.dataset['versionId'] === arrival) button.focus()
    } else if (!hasMore) {
      fallback.current?.focus()
    }
  }, [panel, ids, loading, hasMore, fallback])

  return () => {
    mark.current = { ids: new Set(ids), focused: document.activeElement }
  }
}
