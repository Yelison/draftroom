import { describe, expect, it } from 'vitest'
import { instantKey, isNewestFirst } from './ordering.ts'

describe('isNewestFirst', () => {
  it('orders by the whole instant, so two instants a microsecond apart are not a tie', () => {
    const rows = [
      { instant: '2026-10-13T09:00:00.000200Z', id: 'a' },
      { instant: '2026-10-13T09:00:00.000100Z', id: 'z' },
    ]

    expect(isNewestFirst(rows)).toBe(true)
    expect(isNewestFirst([...rows].reverse())).toBe(false)
  })

  it('breaks a real tie by id, newest first', () => {
    const at = '2026-10-13T09:00:00Z'

    expect(
      isNewestFirst([
        { instant: at, id: 'b' },
        { instant: at, id: 'a' },
      ]),
    ).toBe(true)
    expect(
      isNewestFirst([
        { instant: at, id: 'a' },
        { instant: at, id: 'b' },
      ]),
    ).toBe(false)
  })

  it('reads a missing fraction as zero, whatever precision the server writes', () => {
    expect(instantKey('2026-10-13T09:00:00Z')).toBe(instantKey('2026-10-13T09:00:00.000000000Z'))
    expect(
      isNewestFirst([
        { instant: '2026-10-13T09:00:00.5Z', id: 'a' },
        { instant: '2026-10-13T09:00:00Z', id: 'b' },
      ]),
    ).toBe(true)
  })

  it('refuses an instant that is not RFC 3339 UTC', () => {
    expect(() => instantKey('2026-10-13 09:00:00')).toThrow('RFC 3339')
  })
})
