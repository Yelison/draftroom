/** A thread in the margin, as it is measured: where its text is with no gap opened in it, and how tall its card is. */
export interface MarginCard {
  id: string
  /** The block of the text (a paragraph, a heading, an item) that holds the start of the anchor: gaps are opened between blocks. */
  block: number
  /** The height of the anchor, in pixels from the top of the sheet, measured with the gaps of an earlier layout taken out. */
  top: number
  /** What the card is as tall as now: the active one is the whole thread, the others are compact. */
  height: number
}

export interface PlaceMarginInput {
  cards: readonly MarginCard[]
  /** Threads with no text left: they are listed at the end of the margin, under a label of their own. */
  orphans: readonly { id: string; height: number }[]
  /** The room between two cards. */
  spacing: number
  /**
   * How far a card of another block may go below its text before the text opens room for it: a card a little low is better
   * than a text that jumps for a few pixels.
   */
  tolerance: number
  /** The card of the thread the person is on, which stays level with its text and has the cards above give way. */
  activeId: string | null
  orphanLabelHeight: number
}

export interface MarginLayout {
  /** Where each card starts, in the sheet's pixels with the gaps of `gaps` opened in the text. */
  tops: ReadonlyMap<string, number>
  /** How much room the text must open after each block, by the index of the block, so the next card is level with its text. */
  gaps: ReadonlyMap<number, number>
  orphanLabelTop: number | null
  /** How far down the margin reaches: the sheet is at least this tall. */
  extent: number
}

interface Placed {
  id: string
  block: number
  top: number
  height: number
}

/**
 * Where the cards of the margin go. Each one is level with its anchor; when the one above it reaches into its place:
 *
 * - if it is the active card, the cards above go up into the room they have (as far as the top of the margin) and it stays
 *   level with its text;
 * - what is still missing is pushed down, if both cards are about the same block (there is no room to open in the middle of a
 *   paragraph) or the card is no more than `tolerance` short;
 * - and, otherwise, the text opens a gap after the block of the card above, for what is beyond the tolerance, so that the
 *   card stays level with its text and nothing overlaps.
 *
 * It is a function of measures taken with no gap in the text: the layout of the page applies the gaps and the next
 * measure takes them out again, so a second pass over the same page answers the same and nothing moves.
 */
export function placeMargin({
  cards,
  orphans,
  spacing,
  tolerance,
  activeId,
  orphanLabelHeight,
}: PlaceMarginInput): MarginLayout {
  const tops = new Map<string, number>()
  const gaps = new Map<number, number>()
  const ordered = cards.toSorted((a, b) => a.block - b.block || a.top - b.top)

  // The gaps opened so far, which move every anchor after them down.
  let shift = 0
  const placed: Placed[] = []
  for (const card of ordered) {
    let top = card.top + shift
    const above = placed.at(-1)
    if (above !== undefined) {
      let missing = above.top + above.height + spacing - top
      if (missing > 0 && card.id === activeId) missing -= raiseAbove(placed, missing, spacing)
      if (missing > 0) {
        const another = card.block !== above.block
        const opened = another ? Math.max(0, missing - tolerance) : 0
        if (opened > 0) {
          gaps.set(above.block, (gaps.get(above.block) ?? 0) + opened)
          shift += opened
        }
        top += missing
      }
    }
    placed.push({ id: card.id, block: card.block, top, height: card.height })
  }
  for (const card of placed) tops.set(card.id, card.top)

  const bottom = placed.at(-1)
  let extent = bottom === undefined ? 0 : bottom.top + bottom.height
  let orphanLabelTop: number | null = null
  if (orphans.length > 0) {
    orphanLabelTop = bottom === undefined ? 0 : extent + spacing
    extent = orphanLabelTop + orphanLabelHeight
    for (const orphan of orphans) {
      const top = extent + spacing
      tops.set(orphan.id, top)
      extent = top + orphan.height
    }
  }

  return { tops, gaps, orphanLabelTop, extent }
}

/**
 * Takes the cards placed so far up by `amount`, the last one first and each of the others only as far as the one under it
 * needs, but not above the top of the margin. It answers how far it could.
 */
function raiseAbove(placed: Placed[], amount: number, spacing: number): number {
  const goUp = (by: number) => {
    const tops: number[] = []
    let next = Infinity
    for (let index = placed.length - 1; index >= 0; index--) {
      const card = placed[index]
      if (card === undefined) continue
      const top = index === placed.length - 1 ? card.top - by : Math.min(card.top, next - spacing - card.height)
      tops[index] = top
      next = top
    }
    return tops
  }
  // The room is what the highest card has above it: what is beyond it is not there to be had.
  const beyond = Math.min(0, ...goUp(amount))
  const by = Math.max(0, amount + beyond)
  goUp(by).forEach((top, index) => {
    const card = placed[index]
    if (card !== undefined) card.top = top
  })
  return by
}
