/** How long a test waits for something that must happen. It is the bound of a failure, not a pause: waits end on events. */
export const waitLimitMs = 8_000

/**
 * Lets a test wait for a condition on state that changes by events: whoever changes the state calls `changed()`, and the
 * waits that are pending look again. There is no polling interval to tune and none to flake.
 */
export class Waiter {
  private readonly listeners = new Set<() => void>()

  changed(): void {
    for (const listener of [...this.listeners]) listener()
  }

  /** Resolves with the first non-`undefined` value `look` returns, now or after a change. */
  until<Found>(look: () => Found | undefined, description: string): Promise<Found> {
    return new Promise((resolve, reject) => {
      const now = look()
      if (now !== undefined) return resolve(now)
      const timer = setTimeout(() => {
        this.listeners.delete(check)
        reject(new Error(`Timed out waiting for ${description}`))
      }, waitLimitMs)
      const check = () => {
        const found = look()
        if (found === undefined) return
        clearTimeout(timer)
        this.listeners.delete(check)
        resolve(found)
      }
      this.listeners.add(check)
    })
  }
}

/** Lets the work already queued on the event loop run: the hooks of Hocuspocus that follow an event are promises, not I/O. */
export const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))
