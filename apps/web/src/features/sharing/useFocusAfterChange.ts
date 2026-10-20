import { useEffect, useRef } from 'react'

type Landing = { after: 'adding'; userId: string } | { after: 'removing'; rowId: string }

/**
 * Where the focus goes once the list shows a change that took away what had it: the button that added somebody may be
 * gone with the last person to add, and the row that was removed is gone for good. The landing is chosen when the change
 * is asked for, while the old list is still there to look at, and used when the new one is on screen; a refusal
 * cancels it, so that an unrelated refresh later does not move the focus.
 *
 * `rowIds` are the rows in the order they are shown, with the general row last.
 */
export function useFocusAfterChange(rowIds: readonly string[]) {
  const list = useRef<HTMLUListElement>(null)
  const picker = useRef<HTMLSelectElement>(null)
  const landing = useRef<Landing | null>(null)
  const shown = rowIds.join()

  useEffect(() => {
    const target = landing.current
    if (target === null) return
    landing.current = null
    const roleOf = (rowId: string) =>
      Array.from(list.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])
        .find((row) => row.dataset['row'] === rowId)
        ?.querySelector('select')
    // With everyone already in there is no picker to land on: the person who was just added is where they were working.
    const next = target.after === 'adding' ? (picker.current ?? roleOf(target.userId)) : roleOf(target.rowId)
    next?.focus()
  }, [shown])

  return {
    list,
    picker,
    /** Somebody is about to be added: the focus returns to the picker, or to their row when the picker is gone. */
    willAdd: (userId: string) => {
      landing.current = { after: 'adding', userId }
    },
    /** Somebody is about to be removed: the focus goes to the row after them, which is the general one for the last person. */
    willRemove: (userId: string) => {
      const index = rowIds.indexOf(userId)
      const rowId = rowIds[index + 1]
      landing.current = rowId === undefined ? null : { after: 'removing', rowId }
    },
    cancel: () => {
      landing.current = null
    },
  }
}
