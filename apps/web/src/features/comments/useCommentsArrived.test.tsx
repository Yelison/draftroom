import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { DataSourceContext } from '../../data/DataSourceContext.ts'
import { createMockServer } from '../../data/mock/createMockDataSource.ts'
import { marta } from '../../data/mock/fixtures/index.ts'
import { launchPlan } from '../editor/testing/renderEditor.tsx'
import { commentsGrace, useCommentsArrived } from './useCommentsArrived.ts'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  onlineManager.setOnline(true)
})

function arrived(listThreads?: DataSource['listThreads']) {
  const base = createMockServer().connect({ signedInAs: marta.email })
  const dataSource: DataSource = listThreads === undefined ? base : { ...base, listThreads }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <DataSourceContext value={dataSource}>
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    </DataSourceContext>
  )
  return renderHook(() => useCommentsArrived(launchPlan.id), { wrapper })
}

describe('whether the text may be shown, as far as the comments of the document are concerned', () => {
  it('says no while they are on their way, and yes once they have arrived', async () => {
    const view = arrived()

    expect(view.result.current).toBe(false)
    await act(() => vi.advanceTimersByTimeAsync(10))

    expect(view.result.current).toBe(true)
  })

  it('says yes when they could not be had, so that a refusal does not keep the text away', async () => {
    const view = arrived(async () => {
      throw new Error('refused')
    })

    await act(() => vi.advanceTimersByTimeAsync(10))

    expect(view.result.current).toBe(true)
  })

  it('says yes without waiting when the request is paused, which is what it is with no network: it is not slow, it cannot be made', async () => {
    onlineManager.setOnline(false)

    const view = arrived()
    await act(() => vi.advanceTimersByTimeAsync(10))

    expect(view.result.current).toBe(true)
  })

  it('says yes after the grace period when they never answer, and not before', async () => {
    const view = arrived(() => new Promise(() => {}))

    await act(() => vi.advanceTimersByTimeAsync(commentsGrace - 1))
    expect(view.result.current).toBe(false)

    await act(() => vi.advanceTimersByTimeAsync(2))
    expect(view.result.current).toBe(true)
  })

  it('stays yes when the query goes back to pending, so the text is not taken away to be brought back', async () => {
    let failures = 1
    const view = arrived(async () => {
      if (failures-- > 0) throw new Error('refused')
      return new Promise(() => {})
    })
    await act(() => vi.advanceTimersByTimeAsync(10))
    expect(view.result.current).toBe(true)

    view.rerender()
    await act(() => vi.advanceTimersByTimeAsync(10))

    expect(view.result.current).toBe(true)
  })
})
