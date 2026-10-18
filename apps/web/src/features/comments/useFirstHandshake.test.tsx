import type { HocuspocusProvider } from '@hocuspocus/provider'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useFirstHandshake } from './useFirstHandshake.ts'

/** The two things of a provider that the hook reads: whether it has synchronised, and the event that says it did. */
function fakeProvider(isSynced = false) {
  const listeners = new Set<() => void>()
  const provider = {
    isSynced,
    on: (_event: string, listener: () => void) => void listeners.add(listener),
    off: (_event: string, listener: () => void) => void listeners.delete(listener),
  }
  return {
    provider: provider as unknown as HocuspocusProvider,
    finishHandshake() {
      provider.isSynced = true
      listeners.forEach((listener) => listener())
    },
    listeners,
  }
}

describe('the first handshake of the session', () => {
  it('has not happened until the provider says it synchronised', () => {
    const { provider, finishHandshake } = fakeProvider()
    const { result } = renderHook(() => useFirstHandshake(provider))
    expect(result.current).toBe(false)

    act(finishHandshake)

    expect(result.current).toBe(true)
  })

  it('counts when it finished before anyone was listening', () => {
    const { provider } = fakeProvider(true)

    expect(renderHook(() => useFirstHandshake(provider)).result.current).toBe(true)
  })

  it('stays done when the provider is asked again and is not synchronised any more', () => {
    const { provider, finishHandshake } = fakeProvider()
    const { result, rerender } = renderHook(() => useFirstHandshake(provider))
    act(finishHandshake)

    ;(provider as unknown as { isSynced: boolean }).isSynced = false
    rerender()

    expect(result.current).toBe(true)
  })

  it('stops listening when the panel goes', () => {
    const { provider, listeners } = fakeProvider()
    const { unmount } = renderHook(() => useFirstHandshake(provider))
    expect(listeners.size).toBe(1)

    unmount()

    expect(listeners.size).toBe(0)
  })
})
