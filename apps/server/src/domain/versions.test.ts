import { AUTO_VERSION_IDLE_MS, AUTO_VERSION_MIN_INTERVAL_MS } from '@draftroom/contract/collab'
import { describe, expect, it } from 'vitest'
import { autoVersionSchedule, versionActivity, type AutoVersionTiming, type AutoVersionSchedule } from './versions.ts'

// Protocol §11.2: an automatic version is made when the document has been idle for ten minutes, it has edits since its
// newest version, and the newest automatic version is at least thirty minutes old; when only time is missing the version
// is deferred to the end of the wait, not skipped. The schedule is the part that depends on time alone, so it is known
// without reading what the document holds; whether there are edits is asked of the state, only once the version is due.

const minute = 60_000
const start = Date.UTC(2026, 9, 16, 9, 0, 0)
const at = (minutes: number): Date => new Date(start + minutes * minute)

const facts = (changes: Partial<AutoVersionTiming> = {}): AutoVersionTiming => ({
  now: at(60),
  lastEditAt: at(0),
  newestAutoAt: null,
  ...changes,
})

describe('the constants of the protocol', () => {
  it('are ten minutes of idleness and thirty between automatic versions', () => {
    expect([AUTO_VERSION_IDLE_MS, AUTO_VERSION_MIN_INTERVAL_MS]).toEqual([10 * minute, 30 * minute])
  })
})

describe('the schedule of an automatic version', () => {
  const cases: ReadonlyArray<readonly [string, Partial<AutoVersionTiming>, AutoVersionSchedule]> = [
    ['idle for an hour and no automatic version yet: due', {}, { due: true }],
    ['idle for exactly ten minutes: due', { now: at(10) }, { due: true }],
    [
      'idle for nine minutes and fifty-nine seconds: wait for the tenth minute',
      { now: new Date(start + 10 * minute - 1000) },
      { due: false, until: at(10) },
    ],
    [
      'edited a minute ago: wait until it has been idle for ten minutes',
      { now: at(1), lastEditAt: at(0) },
      { due: false, until: at(10) },
    ],
    [
      'an automatic version twenty minutes ago: defer to the end of the thirty',
      { now: at(60), newestAutoAt: at(40) },
      { due: false, until: at(70) },
    ],
    ['an automatic version exactly thirty minutes ago: due', { now: at(60), newestAutoAt: at(30) }, { due: true }],
    [
      'an automatic version a minute ago and idle too short: wait for whichever comes later',
      { now: at(61), lastEditAt: at(55), newestAutoAt: at(60) },
      { due: false, until: at(90) },
    ],
    [
      'an edit after the deferral was set restarts the idle clock',
      { now: at(65), lastEditAt: at(64), newestAutoAt: at(40) },
      { due: false, until: at(74) },
    ],
    [
      'an automatic version in the future (a skewed clock): wait for its thirty minutes',
      { now: at(60), newestAutoAt: at(70) },
      { due: false, until: at(100) },
    ],
  ]

  it.each(cases)('%s', (_name, changes, expected) => {
    expect(autoVersionSchedule(facts(changes))).toEqual(expected)
  })
})

describe('the event of the history for a version', () => {
  it.each([
    ['auto', 'version.created'],
    ['manual', 'version.created'],
    ['restore', 'version.restored'],
    // The version a restore keeps of what it replaced is part of that restore: its one event is `version.restored`.
    ['pre-restore', null],
  ] as const)('a %s version records %s', (kind, expected) => {
    expect(versionActivity(kind)).toBe(expected)
  })
})
