import { vi } from 'vitest'

interface Query {
  media: string
  matches: boolean
  listeners: Set<EventListenerOrEventListenerObject>
}

/** The queries of the form `(width < 1280px)` and `(width >= 1280px)`: the only ones whose answer depends on the window. */
const widthQuery = /^\(width\s*(<|>=)\s*(\d+(?:\.\d+)?)px\)$/

/**
 * Makes `window.matchMedia` answer for a window of the given width, which jsdom does not have, and returns the way to
 * resize it: the queries are re-evaluated and their `change` listeners called, as a browser does when the window
 * crosses a width. A test that only made the query "match" would pass with any threshold; this one fails if the app
 * asks for the wrong width. Queries about anything else (the colour scheme, say) never match.
 */
export function simulateViewport(initialWidth: number) {
  let width = initialWidth
  const queries = new Set<Query>()

  const matchesAt = (media: string) => {
    const bound = widthQuery.exec(media)
    if (bound === null) return false
    const limit = Number(bound[2])
    return bound[1] === '<' ? width < limit : width >= limit
  }

  vi.spyOn(window, 'matchMedia').mockImplementation((media): MediaQueryList => {
    const query: Query = { media, matches: matchesAt(media), listeners: new Set() }
    queries.add(query)
    return {
      get matches() {
        return query.matches
      },
      media,
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
        void query.listeners.add(listener),
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
        void query.listeners.delete(listener),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }
  })

  return {
    resizeTo(newWidth: number) {
      width = newWidth
      for (const query of queries) {
        const matches = matchesAt(query.media)
        if (matches === query.matches) continue
        query.matches = matches
        for (const listener of query.listeners) {
          if (typeof listener === 'function') listener(new Event('change'))
          else listener.handleEvent(new Event('change'))
        }
      }
    },
  }
}
