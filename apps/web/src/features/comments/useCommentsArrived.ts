import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useDataSource } from '../../data/useDataSource.ts'
import { threadsQuery } from './queries.ts'

/**
 * How long the text waits for the comments. They are what makes the text open room for the cards, so the text is better
 * for waiting a moment, and they are a secondary request: a server that accepts the connection and does not answer must not
 * keep the document of the person hidden for ever. A second and a half is longer than they take when they take what they
 * should, and short enough to be a delay and not a hang.
 */
export const commentsGrace = 1500

/**
 * Whether the text may be shown: the comments of the document have arrived, have failed, cannot be asked for (the request is
 * paused, as it is in a browser with no network) or have taken longer than `commentsGrace`. After that the margin says it is
 * loading them, and the room that the cards open when they arrive is the cost, accepted, of a slow answer.
 *
 * It is a latch: the margin asks for them again when it comes, which puts a query that failed back to pending, and a screen
 * that took the answer for the state would take the text away to bring it back, for ever. Said once, it stays said.
 */
export function useCommentsArrived(documentId: string): boolean {
  const threads = useQuery(threadsQuery(useDataSource(), documentId))
  const [arrived, setArrived] = useState(false)
  if (!arrived && (!threads.isPending || threads.fetchStatus === 'paused')) setArrived(true)

  useEffect(() => {
    if (arrived) return
    const timer = setTimeout(() => setArrived(true), commentsGrace)
    return () => clearTimeout(timer)
  }, [arrived])

  return arrived
}
