import { useLocation, useNavigate } from 'react-router'

/** The sections of the dialog, which an address can name. The dialog shows all of them; the name only says where it opens. */
export const settingsSections = ['profile', 'appearance', 'workspace'] as const
export type SettingsSection = (typeof settingsSections)[number]

const parameter = 'settings'
/** The mark that opening leaves on the history entry it pushes, so that closing knows it can step back. */
const openedHere = { settingsOpenedHere: true } as const

const isSection = (value: string | null): value is SettingsSection => settingsSections.some((name) => name === value)

export const settingsAddress = (section: SettingsSection) => `/?${parameter}=${section}`

/**
 * The dialog of Settings as the address says it: open while `?settings=` is in it, over whatever page the path names. The
 * path does not change, so the page behind stays mounted (the editor with its document and its connection), which a route
 * of its own would not do. An empty or unknown value opens at the top.
 */
export function useSettingsDialog() {
  const location = useLocation()
  const navigate = useNavigate()
  const value = new URLSearchParams(location.search).get(parameter)
  const section = value === null ? null : isSection(value) ? value : 'profile'

  function withParameter(change: (search: URLSearchParams) => void) {
    const search = new URLSearchParams(location.search)
    change(search)
    const text = search.toString()
    return { pathname: location.pathname, search: text === '' ? '' : `?${text}`, hash: location.hash }
  }

  return {
    section,
    /** Adds an entry to the history, so that Back closes the dialog and the page is as it was. */
    open: () =>
      void navigate(
        withParameter((search) => search.set(parameter, 'profile')),
        { state: openedHere },
      ),
    /**
     * Closes it. When it was opened from this page the entry before it is the page, and going back keeps the history as it
     * was, so Back after closing does not open it again. When it was the first thing the person saw (a link, a reload) there
     * is nothing behind it, and the page takes its place.
     */
    close() {
      const state: unknown = location.state
      const fromHere = typeof state === 'object' && state !== null && 'settingsOpenedHere' in state
      if (fromHere) void navigate(-1)
      else
        void navigate(
          withParameter((search) => search.delete(parameter)),
          { replace: true },
        )
    },
  }
}
