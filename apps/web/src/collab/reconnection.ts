import {
  CLOSE_CODES,
  LIBRARY_CLOSE_CODES,
  RECONNECT_INITIAL_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
  RECONNECT_STABLE_MS,
} from '@draftroom/contract/collab'

/**
 * How the client comes back after the server ended a connection (protocol section 6.5). The provider retries by itself
 * after a fixed second, which would hammer a server that answers every attempt with `4429`, so for the closes the
 * server causes the client waits on its own schedule.
 */

const SERVER_CAUSED_CODES: ReadonlySet<number> = new Set([
  CLOSE_CODES['rate-limited'],
  CLOSE_CODES['role-changed'],
  LIBRARY_CLOSE_CODES['connection-reset'],
  LIBRARY_CLOSE_CODES['connection-timeout'],
])

/**
 * Whether the client, and not the provider, decides when to connect again. An in-band close is the server ending the
 * document connection with the socket still open: the provider does not reconnect after it at all.
 */
export const reconnectsOnItsOwn = ({ code, inBand }: { code: number | null; inBand: boolean }): boolean =>
  inBand || (code !== null && SERVER_CAUSED_CODES.has(code))

export interface ReconnectBackoff {
  /** A connection was established (the server answered it); its time up is counted from here. */
  connected(): void
  /** How long to wait before connecting again after a close, and counts the attempt. */
  delayAfter(close: { code: number | null }): number
}

/**
 * The delay doubles from `RECONNECT_INITIAL_DELAY_MS` to `RECONNECT_MAX_DELAY_MS` and is drawn between half and the whole
 * of that value, so clients that were closed together do not return together. It starts over after a connection that
 * stayed up for `RECONNECT_STABLE_MS`; the first return after `4409` on such a connection is at once, because that close
 * is a change of mode and not a fault.
 */
export function createReconnectBackoff({ now, random }: { now: () => number; random: () => number }): ReconnectBackoff {
  let attempts = 0
  let connectedAt: number | null = null

  return {
    connected() {
      connectedAt = now()
    },
    delayAfter({ code }) {
      const stable = connectedAt !== null && now() - connectedAt >= RECONNECT_STABLE_MS
      connectedAt = null
      if (stable) attempts = 0
      if (stable && code === CLOSE_CODES['role-changed']) return 0
      const ceiling = Math.min(RECONNECT_INITIAL_DELAY_MS * 2 ** attempts, RECONNECT_MAX_DELAY_MS)
      attempts += 1
      return Math.round(ceiling * (0.5 + 0.5 * random()))
    },
  }
}
