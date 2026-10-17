import type { CollaboratorEnvironment } from './scriptedCollaborator.ts'

/** What the page tells the demo: whether anyone can see it, what the person asked for, and who is the tab to act. */
export interface PageEnvironment extends CollaboratorEnvironment {
  hidden(): boolean
  /** Calls `listener` when the tab is hidden or shown; returns what stops it. */
  onVisibilityChange(listener: () => void): () => void
  /** Calls `listener` once, when the page is going away. */
  onPageHide(listener: () => void): void
  /**
   * Waits for the turn to play a part for a document, which one tab has at a time while it keeps it: with two tabs open, two
   * copies of the same person would be writing. A tab that waits gets it when the other gives it up or goes away. Resolves with
   * what gives the turn up, or with `null` when `signal` aborts the wait.
   */
  takeTurn(key: string, signal: AbortSignal): Promise<(() => void) | null>
  /** Whether this page was loaded by a reload, which starts the demo again instead of joining the tabs that are open. */
  isReload(): boolean
}

export function browserPage(): PageEnvironment {
  return {
    random: () => Math.random(),
    reducedMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    hidden: () => document.visibilityState === 'hidden',
    onVisibilityChange(listener) {
      document.addEventListener('visibilitychange', listener)
      return () => document.removeEventListener('visibilitychange', listener)
    },
    onPageHide: (listener) => addEventListener('pagehide', listener, { once: true }),
    takeTurn(key, signal) {
      // Without locks there is one tab to think of, or none that can tell: the person plays a part in every tab.
      if (!('locks' in navigator)) return Promise.resolve(() => undefined)
      return new Promise((resolveTurn) => {
        navigator.locks
          .request(`draftroom-demo:${key}`, { signal }, () => new Promise<void>((release) => resolveTurn(release)))
          .catch(() => resolveTurn(null))
      })
    },
    isReload: () => {
      const [navigation] = performance.getEntriesByType('navigation')
      return navigation instanceof PerformanceNavigationTiming && navigation.type === 'reload'
    },
  }
}
