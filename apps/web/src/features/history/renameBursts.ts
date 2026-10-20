import { type ActivityEvent } from './activityEvents.ts'

/**
 * How far apart two renames of a document can be, one after the other, to be told as one burst: people type a title
 * letter by letter and the server records each settled change, so a run of renames is one intention, not several.
 */
export const renameBurstWindowMs = 10 * 60 * 1000

/** One row of the timeline: an event, or the renames of one document that were folded into one. */
export type TimelineEntry =
  | { kind: 'event'; key: string; event: ActivityEvent }
  | {
      kind: 'burst'
      /** The id of the newest event: it stays the same when older renames arrive with the next page. */
      key: string
      /** Newest first, as the list is, and never fewer than two. */
      events: readonly [ActivityEvent, ActivityEvent, ...ActivityEvent[]]
    }

const timeOf = (event: ActivityEvent): number => Date.parse(event.createdAt)

const continuesBurst = (previous: ActivityEvent, event: ActivityEvent): boolean =>
  previous.type === 'document.renamed' &&
  event.type === 'document.renamed' &&
  previous.document.id === event.document.id &&
  timeOf(previous) - timeOf(event) <= renameBurstWindowMs

/**
 * Folds the renames of one document that follow one another, with no other event between them and at most
 * `renameBurstWindowMs` from each to the next, into one entry. It reads the events of every page loaded, newest first,
 * not one page at a time: a burst that "Load more" cut in two is one burst once the second half is in.
 */
export function groupRenameBursts(events: readonly ActivityEvent[]): TimelineEntry[] {
  const runs: ActivityEvent[][] = []
  for (const event of events) {
    const run = runs.at(-1)
    const previous = run?.at(-1)
    if (run !== undefined && previous !== undefined && continuesBurst(previous, event)) run.push(event)
    else runs.push([event])
  }

  return runs.map((run): TimelineEntry => {
    const [newest, second, ...older] = run
    if (newest === undefined) throw new Error('A run of events is never empty')
    if (second === undefined) return { kind: 'event', key: newest.id, event: newest }
    return { kind: 'burst', key: newest.id, events: [newest, second, ...older] }
  })
}

/** The event an entry is told at: the newest of its events, which is the one the list put it at. */
export const entryEvent = (entry: TimelineEntry): ActivityEvent =>
  entry.kind === 'event' ? entry.event : entry.events[0]
