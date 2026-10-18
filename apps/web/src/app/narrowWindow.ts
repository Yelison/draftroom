import { useSyncExternalStore } from 'react'

/** The narrowest window the product is built for. The CSS has no equivalent of this number to share. */
export const desktopMinWidth = 1280

// A strict "less than", so a window of 1279.5 px (a browser zoom can produce one) is narrow and 1280 is not.
export const narrowQuery = `(width < ${desktopMinWidth}px)`

// `matchMedia` tells the app when the window crosses the width, not at every pixel it is dragged through, which is
// what a `resize` listener that stores the width would do.
export function subscribeToNarrowWindow(onChange: () => void) {
  const query = window.matchMedia(narrowQuery)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export const isNarrowWindow = () => window.matchMedia(narrowQuery).matches

/** Whether the window is narrower than a desktop one, and renders again when it crosses that width. */
export function useNarrowWindow(): boolean {
  return useSyncExternalStore(subscribeToNarrowWindow, isNarrowWindow)
}
