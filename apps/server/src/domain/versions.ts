import { AUTO_VERSION_IDLE_MS, AUTO_VERSION_MIN_INTERVAL_MS } from '@draftroom/contract/collab'
import type { ActivityType, VersionKind } from '../db/tables.ts'

// When the server makes a version on its own, and what the history says of each kind (protocol §11). Who may list,
// create and restore versions needs nothing but the role, so those are rows of `permissions.ts`. The clock is a fact of
// the decision, not something it reads, so every case can be written down.

/** Passes of a restore that may find the document changed under it before it gives up with a conflict (protocol §11.4, step 5). */
export const RESTORE_CAPTURE_ATTEMPTS = 3

/** Attempts to commit what a restore wrote, which is already in memory and which the store retry persists if they all fail (step 6). */
export const RESTORE_COMMIT_ATTEMPTS = 3

export interface AutoVersionTiming {
  readonly now: Date
  /** When the document last changed, wherever the change is: in memory, or in what is stored. */
  readonly lastEditAt: Date
  /** When the newest automatic version was made, or `null` when there is none. */
  readonly newestAutoAt: Date | null
}

export type AutoVersionSchedule =
  | { readonly due: true }
  /** Not yet: it is due at this instant, unless an edit arrives first and restarts the idle clock. Deferred, not skipped. */
  | { readonly due: false; readonly until: Date }

/**
 * When an automatic version may be made (protocol §11.2), by time alone: the document has to have been idle for ten
 * minutes and the newest automatic version has to be thirty minutes old. Whether there is anything to version, which needs
 * the state of the document and its newest version, is asked only once this says it is due, so a document that is still
 * waiting costs a clock and not a load.
 */
export function autoVersionSchedule({ now, lastEditAt, newestAutoAt }: AutoVersionTiming): AutoVersionSchedule {
  const idleAt = lastEditAt.getTime() + AUTO_VERSION_IDLE_MS
  const intervalAt = newestAutoAt === null ? 0 : newestAutoAt.getTime() + AUTO_VERSION_MIN_INTERVAL_MS
  const dueAt = Math.max(idleAt, intervalAt)
  return now.getTime() >= dueAt ? { due: true } : { due: false, until: new Date(dueAt) }
}

/**
 * The event the history records for a version, or `null` for none. The version a restore keeps of what it replaced is
 * part of that restore, whose one event is `version.restored`.
 */
export function versionActivity(kind: VersionKind): ActivityType | null {
  switch (kind) {
    case 'auto':
    case 'manual':
      return 'version.created'
    case 'restore':
      return 'version.restored'
    case 'pre-restore':
      return null
  }
}
