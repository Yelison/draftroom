import { describe, expect, it } from 'vitest'
import { placeMargin, type MarginCard, type PlaceMarginInput } from './placeMargin.ts'

const spacing = 8
const labelHeight = 24

const card = (id: string, block: number, top: number, height = 80): MarginCard => ({ id, block, top, height })

const place = (cards: MarginCard[], rest: Partial<Pick<PlaceMarginInput, 'orphans' | 'tolerance' | 'activeId'>> = {}) =>
  placeMargin({
    cards,
    orphans: rest.orphans ?? [],
    spacing,
    tolerance: rest.tolerance ?? 0,
    activeId: rest.activeId ?? null,
    orphanLabelHeight: labelHeight,
  })

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

  describe('the room above the card the person is on', () => {
    it('is used before the text opens room below: the cards above go up and the active one stays level with its text', () => {
      // a ends at 180 and the active card's anchor is at 150: a goes up by the 38 px it is short of, and nothing else moves.
      const { tops, gaps } = place([card('a', 0, 100), card('b', 1, 150, 200)], { activeId: 'b' })

      expect(Object.fromEntries(tops)).toEqual({ a: 62, b: 150 })
      expect(gaps.size).toBe(0)
    })

    it('goes as far up as there is room, and the text gives way only for what is left', () => {
      // a is 150 px tall and only has 20 px above it: it goes up to the top of the margin, and the other 8 px that the active
      // card is short of are room that the text opens after the block of a.
      const { tops, gaps } = place([card('a', 0, 20, 150), card('b', 1, 150, 200)], { activeId: 'b' })

      expect(Object.fromEntries(tops)).toEqual({ a: 0, b: 158 })
      expect(Object.fromEntries(gaps)).toEqual({ 0: 8 })
    })

    it('takes with it every card above that is in its way, each as far as the one under it needs', () => {
      // c is short of 18 px: b goes up by them, and a, which would then be too close to b, goes up 6 px.
      const { tops, gaps } = place([card('a', 0, 60, 50), card('b', 1, 130, 50), card('c', 2, 170, 100)], {
        activeId: 'c',
      })

      expect(Object.fromEntries(tops)).toEqual({ a: 54, b: 112, c: 170 })
      expect(gaps.size).toBe(0)
    })

    it('moves nothing above for a card that is not the active one', () => {
      const { tops } = place([card('a', 0, 100), card('b', 1, 150, 200)], { activeId: 'a' })

      expect(Object.fromEntries(tops)).toEqual({ a: 100, b: 188 })
    })
  })

  describe('the push that does not open room', () => {
    it('lets the next card, of another block, go down by up to the tolerance without opening a gap', () => {
      const { tops, gaps } = place([card('a', 0, 100), card('b', 1, 150)], { tolerance: 48 })

      expect(Object.fromEntries(tops)).toEqual({ a: 100, b: 188 })
      expect(gaps.size).toBe(0)
    })

    it('opens only what is beyond the tolerance', () => {
      // b is short of 68 px; 48 are the tolerance and the text opens the other 20.
      const { tops, gaps } = place([card('a', 0, 100), card('b', 1, 120)], { tolerance: 48 })

      expect(Object.fromEntries(tops)).toEqual({ a: 100, b: 188 })
      expect(Object.fromEntries(gaps)).toEqual({ 0: 20 })
    })

    it('carries what it opened to the cards after it', () => {
      const { tops } = place([card('a', 0, 100), card('b', 1, 120), card('c', 2, 400)], { tolerance: 48 })

      // c's anchor went down by the 20 px of the gap.
      expect(tops.get('c')).toBe(420)
    })
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
