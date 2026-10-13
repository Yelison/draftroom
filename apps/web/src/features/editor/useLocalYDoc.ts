import { useState, useSyncExternalStore } from 'react'
import * as Y from 'yjs'

/**
 * A store with one Yjs document that exists while something is subscribed to it: made on subscribing, destroyed on
 * unsubscribing. Destroying a `Y.Doc` takes its listeners with it, so a document that React rendered twice and cleaned up
 * once (StrictMode runs every effect, cleanup and effect again) would reach the editor dead; here each subscription gets
 * a document of its own.
 */
function createYDocStore() {
  let current: Y.Doc | null = null
  return {
    subscribe() {
      const created = new Y.Doc()
      current = created
      return () => {
        created.destroy()
        current = null
      }
    },
    getSnapshot: () => current,
  }
}

/**
 * The Yjs document of the document that is open: made when the screen is shown and destroyed when it is left, one per
 * opening. It is `null` for the first render, until the screen has subscribed.
 */
export function useLocalYDoc(): Y.Doc | null {
  const [store] = useState(createYDocStore)
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
