import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecordingLog } from '../../../test/support/collab/harness.ts'
import type { LiveAccess } from '../live-access.ts'
import type { Sessions } from './sessions.ts'
import { startSessionSweep, type SessionSweep } from './sessionSweep.ts'

// What happens to the sessions that ended without anyone signing out: they are removed and their connections close, which
// protocol §6.3 asks for expiry as much as for sign-out.

afterEach(() => {
  vi.useRealTimers()
})

function setUp(expire: () => Promise<string[]>) {
  const closed: string[] = []
  const log = new RecordingLog()
  const sessions: Pick<Sessions, 'expire'> = { expire }
  const liveAccess: Pick<LiveAccess, 'sessionEnded'> = {
    sessionEnded: async (sessionId) => void closed.push(sessionId),
  }
  const sweep = startSessionSweep({ sessions, liveAccess, log, intervalMs: 60_000 })
  return { sweep, closed, log }
}

let running: SessionSweep | undefined
afterEach(() => running?.stop())

describe('a sweep', () => {
  it('closes the connections of every session it removed, and says how many', async () => {
    const { sweep, closed } = setUp(async () => ['session-1', 'session-2'])
    running = sweep

    expect(await sweep.run()).toBe(2)
    expect(closed).toEqual(['session-1', 'session-2'])
  })

  it('closes nothing when nothing ended', async () => {
    const { sweep, closed } = setUp(async () => [])
    running = sweep

    expect(await sweep.run()).toBe(0)
    expect(closed).toEqual([])
  })

  it('logs a failure and does not throw, because it runs on a timer and a rejection there would end the process', async () => {
    const { sweep, log } = setUp(async () => {
      throw new Error('the database is down')
    })
    running = sweep

    await expect(sweep.run()).resolves.toBe(0)

    expect(log.entries).toEqual([
      expect.objectContaining({ level: 'error', message: expect.stringContaining('sessions') }),
    ])
  })
})

describe('the timer of the sweep', () => {
  it('runs it every interval, and stops when it is told to', async () => {
    vi.useFakeTimers()
    let runs = 0
    const { sweep } = setUp(async () => {
      runs += 1
      return []
    })

    await vi.advanceTimersByTimeAsync(60_000 * 3)
    sweep.stop()
    await vi.advanceTimersByTimeAsync(60_000 * 3)

    expect(runs).toBe(3)
  })

  it('does not keep the process alive, which a shutdown that forgot to stop it would otherwise suffer', () => {
    const started = vi.spyOn(globalThis, 'setInterval')
    const { sweep } = setUp(async () => [])
    running = sweep

    const timer = started.mock.results[0]?.value as NodeJS.Timeout
    expect(timer.hasRef()).toBe(false)
  })
})
