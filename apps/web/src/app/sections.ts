import { useMatches } from 'react-router'

/** The sections of the navigation rail, one per item. */
export const sections = ['home', 'documents', 'shared', 'history', 'members'] as const
export type Section = (typeof sections)[number]

/** What a route declares about itself for the shell. A route without a section highlights no item of the rail. */
export interface RouteHandle {
  section?: Section | undefined
  /**
   * The route is a dialog over its parent's screen, which stays on screen behind it. Opening or closing it is not a new
   * page: the focus is the dialog's to take and to give back, not the headline's.
   */
  dialog?: boolean | undefined
}

const isSection = (value: unknown): value is Section => sections.some((section) => section === value)

/**
 * The section the current page belongs to, declared by the route table. Folders and documents belong to Documents:
 * the rail says where in the product the person is, not which screen they are on. The deepest route decides.
 */
export function useActiveSection(): Section | undefined {
  const handle = useMatches().at(-1)?.handle
  if (typeof handle !== 'object' || handle === null || !('section' in handle)) return undefined
  return isSection(handle.section) ? handle.section : undefined
}
