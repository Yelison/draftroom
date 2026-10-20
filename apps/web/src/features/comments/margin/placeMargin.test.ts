import { describe, expect, it } from 'vitest'
import { placeMargin, type MarginCard, type PlaceMarginInput } from './placeMargin.ts'

const spacing = 8
const labelHeight = 24

const card = (id: string, block: number, top: number, height = 80): MarginCard => ({ id, block, top, height })

const place = (cards: MarginCard[], rest: Partial<PlaceMarginInput> = {}) =>
  placeMargin({ cards, orphans: [], spacing, orphanLabelHeight: labelHeight, ...rest })

const topsOf = (cards: MarginCard[], rest?: Partial<PlaceMarginInput>) => Object.fromEntries(place(cards, rest).tops)

describe('placeMargin', () => {
  it('puts each card at the height of its anchor when the anchors are far apart', () => {
    expect(topsOf([card('a', 0, 10), card('b', 1, 300), card('c', 2, 700)])).toEqual({ a: 10, b: 300, c: 700 })
  })

  it('opens no gap in the text when nothing overlaps', () => {
    expect(place([card('a', 0, 10), card('b', 1, 300)]).gaps.size).toBe(0)
  })

  it('pushes the second card of the same block down so that the two do not overlap', () => {
    const { tops, gaps } = place([card('a', 0, 100), card('b', 0, 120)])
    expect(Object.fromEntries(tops)).toEqual({ a: 100, b: 100 + 80 + spacing })
    expect(gaps.size).toBe(0)
  })

  it('opens a gap after the block of a card that reaches into the next anchor, so that the next card stays level with its text', () => {
    // a ends at 180 and the next anchor is at 150: the text makes room for the 38 px (180 + 8 - 150) that it lacks.
    const { tops, gaps } = place([card('a', 0, 100), card('b', 1, 150)])
    expect(Object.fromEntries(tops)).toEqual({ a: 100, b: 188 })
    expect(Object.fromEntries(gaps)).toEqual({ 0: 38 })
  })

  it('carries a gap forward: what the text already made room for is not asked for again', () => {
    const { tops, gaps } = place([card('a', 0, 100), card('b', 1, 150), card('c', 2, 260)])
    // b ends at 268, c's anchor was at 260 and is now at 298: it has room.
    expect(Object.fromEntries(tops)).toEqual({ a: 100, b: 188, c: 298 })
    expect(Object.fromEntries(gaps)).toEqual({ 0: 38 })
  })

  it('adds up the gaps of successive blocks', () => {
    const { tops, gaps } = place([card('a', 0, 0), card('b', 1, 20), card('c', 2, 40)])
    expect(Object.fromEntries(tops)).toEqual({ a: 0, b: 88, c: 176 })
    expect(Object.fromEntries(gaps)).toEqual({ 0: 68, 1: 68 })
  })

  it('gives the active card the height it has, which pushes what follows', () => {
    const cards = [card('a', 0, 100, 240), card('b', 1, 200)]
    expect(topsOf(cards)).toEqual({ a: 100, b: 100 + 240 + spacing })
  })

  it('orders the cards by where their anchors are, not by the order they were given', () => {
    expect(topsOf([card('b', 1, 300), card('a', 0, 10)])).toEqual({ a: 10, b: 300 })
  })

  it('keeps the order of the text for two anchors at the same height', () => {
    expect(topsOf([card('a', 0, 50), card('b', 0, 50)])).toEqual({ a: 50, b: 50 + 80 + spacing })
  })

  describe('orphans', () => {
    it('go under the last card, after a label of their own', () => {
      const { tops, orphanLabelTop } = place([card('a', 0, 100)], { orphans: [{ id: 'x', height: 60 }] })
      expect(orphanLabelTop).toBe(100 + 80 + spacing)
      expect(Object.fromEntries(tops)).toEqual({ a: 100, x: 100 + 80 + spacing + labelHeight + spacing })
    })

    it('are stacked one under the other', () => {
      const { tops } = place([], {
        orphans: [
          { id: 'x', height: 60 },
          { id: 'y', height: 40 },
        ],
      })
      expect(Object.fromEntries(tops)).toEqual({ x: labelHeight + spacing, y: labelHeight + spacing + 60 + spacing })
    })

    it('have no label, and take no room, when there are none', () => {
      const result = place([card('a', 0, 100)])
      expect(result.orphanLabelTop).toBeNull()
      expect(result.extent).toBe(180)
    })
  })

  describe('extent', () => {
    it('is the bottom of the last thing in the margin', () => {
      expect(place([card('a', 0, 100), card('b', 1, 400, 120)]).extent).toBe(520)
    })

    it('includes the orphans', () => {
      expect(place([card('a', 0, 100)], { orphans: [{ id: 'x', height: 60 }] }).extent).toBe(
        100 + 80 + spacing + labelHeight + spacing + 60,
      )
    })

    it('is nothing when there is nothing to show (a filter that hides every thread)', () => {
      expect(place([])).toEqual({ tops: new Map(), gaps: new Map(), orphanLabelTop: null, extent: 0 })
    })
  })

  it('never lets two cards overlap, whatever the anchors', () => {
    const anchors = [0, 0, 5, 5, 6, 90, 91, 400, 401, 402]
    const cards = anchors.map((top, index) => card(`t${index}`, Math.floor(index / 2), top, 30 + (index % 3) * 50))
    const { tops } = place(cards)
    const placed = cards.map((c) => ({ top: tops.get(c.id) ?? NaN, height: c.height }))
    for (const [index, current] of placed.slice(1).entries()) {
      const previous = placed[index]
      expect(previous).toBeDefined()
      expect(current.top).toBeGreaterThanOrEqual((previous?.top ?? 0) + (previous?.height ?? 0) + spacing)
    }
  })
})
