import type { Schema } from '@draftroom/contract'
import type { Placement } from '../highlightPlugin.ts'
import type { ThreadFilterValue } from '../ThreadFilter.tsx'

type Thread = Schema<'Thread'>

export interface ArrangedThreads {
  /** The threads whose text is there, in the order of the text. */
  placed: { thread: Thread; from: number }[]
  /** The threads whose text is gone, which the margin lists at its end. */
  orphaned: Thread[]
  /** The threads the text has not placed yet, because the document is still loading: neither on the text nor orphans. */
  waiting: Thread[]
}

const madeFirst = (a: Thread, b: Thread) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)

/**
 * What the margin lists under the filter, and where each thread goes: level with its text, at the end for the ones with
 * none, or aside while the document says where they are. The order is the order of the text, which is also the order of the
 * margin in the page, so a person who moves through it with the keyboard moves through the document.
 */
export function arrangeThreads({
  threads,
  placements,
  filter,
}: {
  threads: readonly Thread[]
  placements: ReadonlyMap<string, Placement>
  filter: ThreadFilterValue
}): ArrangedThreads {
  const arranged: ArrangedThreads = { placed: [], orphaned: [], waiting: [] }
  for (const thread of threads.toSorted(madeFirst)) {
    if (filter !== 'all' && thread.status !== filter) continue
    const placement = placements.get(thread.id)
    if (placement?.status === 'placed') arranged.placed.push({ thread, from: placement.from })
    else if (placement?.status === 'orphaned') arranged.orphaned.push(thread)
    else arranged.waiting.push(thread)
  }
  // A stable sort: threads at one place keep the order they were made in, which they were put in above.
  arranged.placed.sort((a, b) => a.from - b.from)
  return arranged
}
