import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTrashSelection } from './useTrashSelection.ts'

const selectionOf = (ids: readonly string[], index: number) => ids[index]

describe('the selection of the trash', () => {
  it('is the first document until another is picked', () => {
    const ids = ['a', 'b', 'c']
    const { result } = renderHook(() => useTrashSelection(ids))

    expect(selectionOf(ids, result.current.selectedIndex)).toBe('a')

    act(() => result.current.select('c'))

    expect(selectionOf(ids, result.current.selectedIndex)).toBe('c')
  })

  it.each([
    { case: 'the one that took its place when it leaves', picked: 'b', left: ['a', 'c'], expected: 'c' },
    { case: 'the one before it when it was the last', picked: 'c', left: ['a', 'b'], expected: 'b' },
    { case: 'the first when the first leaves', picked: 'a', left: ['b', 'c'], expected: 'b' },
  ])('is $case', ({ picked, left, expected }) => {
    const { result, rerender } = renderHook(({ ids }) => useTrashSelection(ids), {
      initialProps: { ids: ['a', 'b', 'c'] as readonly string[] },
    })
    act(() => result.current.select(picked))

    rerender({ ids: left })

    expect(selectionOf(left, result.current.selectedIndex)).toBe(expected)
  })

  it('follows the selected document when rows above it leave first, so the row that takes its place is the right one', () => {
    const { result, rerender } = renderHook(({ ids }) => useTrashSelection(ids), {
      initialProps: { ids: ['a', 'b', 'c', 'd'] as readonly string[] },
    })
    act(() => result.current.select('b'))

    rerender({ ids: ['b', 'c', 'd'] })
    rerender({ ids: ['c', 'd'] })

    expect(selectionOf(['c', 'd'], result.current.selectedIndex)).toBe('c')
  })

  it.each([
    { case: 'the rows before it leave', left: ['c', 'd'], expected: 'c' },
    { case: 'the rows after it and before it leave', left: ['a', 'd'], expected: 'd' },
  ])(
    'does not skip the row that takes its place when several rows leave in the same reading: $case',
    ({ left, expected }) => {
      const { result, rerender } = renderHook(({ ids }) => useTrashSelection(ids), {
        initialProps: { ids: ['a', 'b', 'c', 'd'] as readonly string[] },
      })
      act(() => result.current.select('b'))

      rerender({ ids: left })

      expect(selectionOf(left, result.current.selectedIndex)).toBe(expected)
    },
  )

  it('is nothing when the list is empty', () => {
    const { result } = renderHook(() => useTrashSelection([]))

    expect(result.current.selectedIndex).toBe(-1)
  })
})
