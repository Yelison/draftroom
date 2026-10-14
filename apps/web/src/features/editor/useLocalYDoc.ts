import { useEffect, useState } from 'react'
import * as Y from 'yjs'

/**
 * The Yjs document of the document that is open: made when the screen is shown and destroyed when it is left, one per
 * opening. It is `null` for the first render, until the screen has mounted.
 *
 * It is made in an effect, not while rendering. Destroying a `Y.Doc` takes its listeners with it, and StrictMode runs
 * every effect, its cleanup and the effect again: a document made while rendering would be destroyed by that cleanup and
 * handed on dead. Made in the effect, each run has a document of its own, and the render that follows (StrictMode's two
 * runs are batched into one) sees the one that is alive.
 */
export function useLocalYDoc(): Y.Doc | null {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null)

  useEffect(() => {
    const created = new Y.Doc()
    // The state is the way this effect hands an external resource to the render, which is the case a setState in an effect
    // is for: the document cannot be made while rendering, for the reason above.
    // oxlint-disable-next-line react/set-state-in-effect
    setYdoc(created)
    return () => created.destroy()
  }, [])

  return ydoc
}
