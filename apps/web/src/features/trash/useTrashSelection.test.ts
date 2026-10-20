import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTrashSelection } from './useTrashSelection.ts'

describe('the selection of the trash', () => {
  it('is the first document until another is picked', () => {
    const { result } = renderHook(() => useTrashSelection(['a', 'b', 'c']))

    expect(result.current.selectedId).toBe('a')

    act(() => result.current.select('c'))

    expect(result.current.selectedId).toBe('c')
    expect(result.current.selectedIndex).toBe(2)
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

    expect(result.current.selectedId).toBe(expected)
  })

  it('is nothing when the list is empty', () => {
    const { result } = renderHook(() => useTrashSelection([]))

    expect(result.current.selectedId).toBeUndefined()
    expect(result.current.selectedIndex).toBe(-1)
  })
})
