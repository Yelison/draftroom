import type { HocuspocusProvider } from '@hocuspocus/provider'
import { useMemo, useSyncExternalStore } from 'react'

/** Remembers that the provider synchronised once, which is a fact that never goes back. */
class HandshakeLatch {
  private done = false
  private readonly listeners = new Set<() => void>()
  private readonly onSynced = () => {
    this.done = true
    this.listeners.forEach((listener) => listener())
  }

  constructor(private readonly provider: HocuspocusProvider) {}

  // Read from the provider until it is true, so a handshake that finished before anyone listened counts.
  readonly getSnapshot = (): boolean => (this.done ||= this.provider.isSynced)

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.listeners.size === 0) this.provider.on('synced', this.onSynced)
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.provider.off('synced', this.onSynced)
    }
  }
}

/**
 * Whether the document has been synchronised with the server at least once in this session. Until then a thread is not
 * placed and not orphaned: a document that is still loading must not flash orphans (protocol section 10.3). It stays true
 * after a reconnection: the text the threads were placed on is still there.
 */
export function useFirstHandshake(provider: HocuspocusProvider): boolean {
  const latch = useMemo(() => new HandshakeLatch(provider), [provider])
  return useSyncExternalStore(latch.subscribe, latch.getSnapshot)
}
