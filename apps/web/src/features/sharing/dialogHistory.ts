import type { NavigateFunction, Location } from 'react-router'

/** The mark the Share button leaves on the history entry it pushes, so that closing the dialog knows it can step back. */
const openedFromEditor = { sharingOpenedFromEditor: true } as const

export const openShareDialog = (navigate: NavigateFunction, documentId: string) =>
  void navigate(`/documents/${documentId}/share`, { state: openedFromEditor })

/**
 * Leaves the share route for the editor. When the dialog was opened from the editor the entry before it is the editor,
 * and going back to it keeps the history as it was, so Back after closing does not open the dialog again. When the
 * dialog was the first thing the person opened (a link, a reload) there is nothing behind it to go back to, and the
 * editor takes its place.
 */
export function closeShareDialog(navigate: NavigateFunction, location: Location, documentId: string) {
  const state: unknown = location.state
  const fromEditor = typeof state === 'object' && state !== null && 'sharingOpenedFromEditor' in state
  if (fromEditor) void navigate(-1)
  else void navigate(`/documents/${documentId}`, { replace: true })
}
