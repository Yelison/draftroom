/** What the router carries to Documents when the open document was archived: its title, for the announcement. */
export interface ArchivedNotice {
  archivedTitle: string
}

export const archivedNotice = (archivedTitle: string): ArchivedNotice => ({ archivedTitle })

/** The notice in a location's `state`, which is `unknown` to the router and anything to a person typing a URL. */
export function archivedTitleFrom(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('archivedTitle' in state)) return null
  return typeof state.archivedTitle === 'string' ? state.archivedTitle : null
}
