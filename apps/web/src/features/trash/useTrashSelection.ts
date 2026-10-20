import { useState } from 'react'

interface Selection {
  id: string | null
  /** Where the selected row was in the list: the row that takes its place is the one at this index once it leaves. */
  index: number
}

/**
 * Which document of the trash is selected. The first one is until the person picks another; when the selected one leaves
 * the list the selection is the row that took its place, or the one before it when it was the last. That is worked out
 * while rendering, from the ids that are there, so the panel never shows a document that is gone.
 *
 * `ids` are the ids of the rows, in order.
 */
export function useTrashSelection(ids: readonly string[]) {
  const [selection, setSelection] = useState<Selection>({ id: null, index: 0 })

  const known = selection.id === null ? -1 : ids.indexOf(selection.id)
  const selectedIndex = ids.length === 0 ? -1 : known >= 0 ? known : Math.min(selection.index, ids.length - 1)

  return {
    selectedIndex,
    selectedId: ids[selectedIndex],
    select: (id: string) => setSelection({ id, index: ids.indexOf(id) }),
  }
}
