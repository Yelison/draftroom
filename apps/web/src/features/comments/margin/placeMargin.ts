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

/**
 * Where the cards of the margin go. Each one is level with its anchor; when the one above it reaches into its place, it
 * is pushed down if both are about the same block (there is no room to open in the middle of a paragraph) and, otherwise,
 * the text opens a gap after the block of the card above, so that the card stays level with its text and nothing overlaps.
 *
 * It is a function of measures taken with no gap in the text: the layout of the page applies the gaps and the next
 * measure takes them out again, so a second pass over the same page answers the same and nothing moves.
 */
export function placeMargin({ cards, orphans, spacing, orphanLabelHeight }: PlaceMarginInput): MarginLayout {
  const tops = new Map<string, number>()
  const gaps = new Map<number, number>()
  const ordered = cards.toSorted((a, b) => a.block - b.block || a.top - b.top)

  // The gaps opened so far, which move every anchor after them down, and where the card above ends.
  let shift = 0
  let bottom: number | null = null
  let previousBlock: number | null = null
  for (const card of ordered) {
    let top = card.top + shift
    if (bottom !== null) {
      const missing = bottom + spacing - top
      if (missing > 0 && previousBlock !== null && card.block !== previousBlock) {
        gaps.set(previousBlock, (gaps.get(previousBlock) ?? 0) + missing)
        shift += missing
        top += missing
      } else if (missing > 0) {
        top += missing
      }
    }
    tops.set(card.id, top)
    bottom = top + card.height
    previousBlock = card.block
  }

  let extent = bottom ?? 0
  let orphanLabelTop: number | null = null
  if (orphans.length > 0) {
    orphanLabelTop = bottom === null ? 0 : bottom + spacing
    extent = orphanLabelTop + orphanLabelHeight
    for (const orphan of orphans) {
      const top = extent + spacing
      tops.set(orphan.id, top)
      extent = top + orphan.height
    }
  }

  return { tops, gaps, orphanLabelTop, extent }
}
