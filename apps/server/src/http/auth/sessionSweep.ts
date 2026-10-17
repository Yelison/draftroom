import type { CollabLog } from '../../collab/log.ts'
import type { LiveAccess } from '../live-access.ts'
import type { Sessions } from './sessions.ts'

export interface SessionSweepOptions {
  readonly sessions: Pick<Sessions, 'expire'>
  readonly liveAccess: Pick<LiveAccess, 'sessionEnded'>
  readonly log: CollabLog
  readonly intervalMs: number
}

export interface SessionSweep {
  /** One pass, now: how many sessions it removed. It never rejects. */
  run(): Promise<number>
  stop(): void
}

/** Every minute: a session that nobody ended is found within a minute of its end, and its connections close. */
export const sessionSweepIntervalMs = 60_000

/**
 * Removes the sessions that ended by time and closes the connections they opened (protocol §6.3, "Session ended"). A
 * request of a session that has ended is refused at once, whether or not this has run, because the check is made when the
 * session is read; what the sweep adds is the sockets that were already open, which no request would ever check again. So
 * a socket outlives its session by at most one interval.
 */
export function startSessionSweep({ sessions, liveAccess, log, intervalMs }: SessionSweepOptions): SessionSweep {
  async function run(): Promise<number> {
    try {
      const ended = await sessions.expire()
      await Promise.all(ended.map((sessionId) => liveAccess.sessionEnded(sessionId)))
      return ended.length
    } catch (error) {
      // On a timer: whatever goes wrong is logged and the next pass tries again.
      log.error({ error }, 'removing the sessions that ended failed')
      return 0
    }
  }

  const timer = setInterval(() => void run(), intervalMs)
  timer.unref()
  return { run, stop: () => clearInterval(timer) }
}
