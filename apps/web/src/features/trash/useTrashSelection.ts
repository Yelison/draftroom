import { useState } from 'react'

interface Selection {
  /** The selected document, or `null` while the person has not picked one: then it is the first. */
  id: string | null
  /** The ids of the last list the selection saw: where the selected row was among the rows that were there. */
  ids: readonly string[]
}

/** The document that is selected once `id` may have left: itself, or the first row after it that is still there, or the last one before it. */
function survivor(id: string, previous: readonly string[], ids: readonly string[]) {
  const present = new Set(ids)
  if (present.has(id)) return id
  const at = previous.indexOf(id)
  return (
    previous.slice(at + 1).find((other) => present.has(other)) ??
    previous.slice(0, at).findLast((other) => present.has(other))
  )
}

/**
 * Which document of the trash is selected. The first one is until the person picks another; when the selected one leaves
 * the list the selection is the row that took its place, or the one before it when it was the last. It is worked out
 * while rendering, from the ids that are there and the ones that were, so the panel never shows a document that is gone
 * and several rows leaving at once do not make the selection skip the one that takes its place.
 *
 * `ids` are the ids of the rows, in order, and keep their identity until the list changes.
 */
export function useTrashSelection(ids: readonly string[]) {
  const [selection, setSelection] = useState<Selection>({ id: null, ids })

  const selectedId = selection.id === null ? ids[0] : survivor(selection.id, selection.ids, ids)
  // Remember the list this was worked out from. Adjusted while rendering, as React asks for state that follows props.
  if (selection.ids !== ids) setSelection({ id: selection.id === null ? null : (selectedId ?? null), ids })

  return {
    selectedIndex: selectedId === undefined ? -1 : ids.indexOf(selectedId),
    select: (id: string) => setSelection({ id, ids }),
  }
}
