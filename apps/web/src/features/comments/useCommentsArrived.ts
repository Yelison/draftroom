import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useDataSource } from '../../data/useDataSource.ts'
import { threadsQuery } from './queries.ts'

/**
 * Whether the comments of a document have arrived, or have failed to. It is a latch: the margin asks for them again when it
 * comes, which puts a query that failed back to pending, and a screen that took the answer for the state would take the text
 * away to bring it back, for ever. Said once, it stays said.
 */
export function useCommentsArrived(documentId: string): boolean {
  const threads = useQuery(threadsQuery(useDataSource(), documentId))
  const [arrived, setArrived] = useState(false)
  if (!arrived && !threads.isPending) setArrived(true)
  return arrived
}
