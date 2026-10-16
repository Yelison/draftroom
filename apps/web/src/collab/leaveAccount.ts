import type { Network } from './network.ts'
import { copiesOf, hasUnstoredChanges, purgeCopies } from './offlineCache.ts'

/**
 * Leaving an account, by signing out or by switching to another (protocol section 12.2): what this device kept of its
 * documents is removed. Some of it may be changes the server never stored, which the removal would destroy, so those are
 * waited for first and, if they are still there, the person is asked.
 *
 * It **rejects** when the browser keeps copies and cannot list them (no `indexedDB.databases()`), instead of going on as if
 * there were none: nothing was removed, and the copies of the account stay on this device. Whoever calls it must catch that,
 * tell the person that this browser cannot clear what it kept of their account, and let them choose between leaving anyway
 * (the sign-out without the purge) and staying. A browser that keeps nothing is not that case: it resolves with
 * `{ purged: true }` and asks nothing.
 */

/** A few seconds: long enough for what is on its way to be stored, short enough for a person who is leaving. */
export const UNSTORED_WAIT_MS = 5_000
const POLL_MS = 250

export interface LeaveAccountOptions {
  /** The account that is left: the one that was signed in, which on a switch is the previous one. */
  readonly userId: string
  readonly network: Network
  /** Asked once, with how many documents have changes that were never stored, when there still are any after the wait. */
  readonly confirm: (unstoredDocuments: number) => Promise<boolean>
  readonly waitMs?: number
}

export type LeaveAccountOutcome =
  | { readonly purged: true }
  /** The person chose to keep what was never stored: nothing was removed. */
  | { readonly purged: false; readonly unstoredDocuments: number }

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function countUnstoredDocuments(userId: string): Promise<number> {
  const unstored = await Promise.all((await copiesOf(userId)).map(hasUnstoredChanges))
  return unstored.filter(Boolean).length
}

export async function leaveAccount({
  userId,
  network,
  confirm,
  waitMs = UNSTORED_WAIT_MS,
}: LeaveAccountOptions): Promise<LeaveAccountOutcome> {
  let unstoredDocuments = await countUnstoredDocuments(userId)
  // Only a device with a connection can store anything: offline, waiting would only keep the person from leaving.
  for (let waited = 0; unstoredDocuments > 0 && network.online() && waited < waitMs; waited += POLL_MS) {
    await pause(POLL_MS)
    unstoredDocuments = await countUnstoredDocuments(userId)
  }
  if (unstoredDocuments > 0 && !(await confirm(unstoredDocuments))) return { purged: false, unstoredDocuments }
  // The copies there are now, not the ones that were counted: a document may have been opened meanwhile.
  await purgeCopies(await copiesOf(userId))
  return { purged: true }
}
