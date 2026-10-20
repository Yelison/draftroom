import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { anchorTop } from './anchorTop.ts'
import { commentGapAttribute, setCommentGaps } from './commentGaps.ts'
import { placeMargin, type MarginCard, type MarginLayout } from './placeMargin.ts'

/** Where the cards of the margin go on the page, which the margin applies; `null` until the page has been measured. */
export interface MarginPlan {
  tops: ReadonlyMap<string, number>
  /** Where the label of the threads with no text goes; `null` when there is none. */
  labelTop: number | null
  /** How far down the margin reaches, so the page is at least that tall. */
  extent: number
}

export interface MarginLayoutInput {
  editor: Editor
  /** The margin itself: the origin of what is measured, and the element whose gap is the room between cards. */
  margin: RefObject<HTMLElement | null>
  /** The threads on the text, in the order of the text, with where their anchor starts. */
  placed: readonly { id: string; from: number }[]
  /** The threads that have no place on the text: listed at the end, under a label when `labelled`. */
  trailing: readonly string[]
  labelled: boolean
  /** Whether the margin is beside the text; below the width of a desktop it follows the text and nothing is measured. */
  beside: boolean
}

/**
 * Measures the page and puts the margin on it: the height of each anchor, the height of each card and of the label, and
 * the answer of `placeMargin`, whose gaps it opens in the text. Everything it measures is taken with the gaps it opened
 * before taken out again, so measuring a page that has them gives the answer it gave before and the layout settles instead
 * of feeding on itself.
 *
 * It measures when what it lists changes and, through observers, when a card, the text or the label changes size: a reply
 * being written, the active thread, a line that wraps. The observers measure on the next frame, not inside the
 * notification, which the browser would otherwise report as a loop.
 */
export function useMarginLayout({ editor, margin, placed, trailing, labelled, beside }: MarginLayoutInput) {
  const [plan, setPlan] = useState<MarginPlan | null>(null)
  const cards = useRef(new Map<string, HTMLElement>())
  const label = useRef<HTMLElement | null>(null)
  const appliedGaps = useRef<ReadonlyMap<number, number>>(new Map())
  const observer = useRef<ResizeObserver | null>(null)
  const frame = useRef(0)
  // The measuring of the latest render, which is what the observers call: they outlive the render they were made in.
  const measureNow = useRef<() => void>(() => {})

  useLayoutEffect(() => {
    const measure = () => {
      const element = margin.current
      if (element === null) return
      const layout = measureMargin({
        editor,
        element,
        cards: cards.current,
        label: label.current,
        placed,
        trailing,
        labelled,
      })
      if (layout === null) return
      if (!sameGaps(appliedGaps.current, layout.gaps)) {
        appliedGaps.current = layout.gaps
        setCommentGaps(editor, layout.gaps)
      }
      setPlan((previous) => (samePlan(previous, layout) ? previous : planOf(layout)))
    }
    measureNow.current = measure
    if (!beside) {
      // Under the text there is nothing to be level with, and the text keeps no room it opened.
      if (appliedGaps.current.size > 0) {
        appliedGaps.current = new Map()
        setCommentGaps(editor, appliedGaps.current)
      }
      // oxlint-disable-next-line react/set-state-in-effect
      setPlan(null)
      return
    }
    measure()
  }, [editor, margin, placed, trailing, labelled, beside])

  useEffect(() => {
    if (!beside || typeof ResizeObserver === 'undefined') return
    const schedule = () => {
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => measureNow.current())
    }
    const created = new ResizeObserver(schedule)
    observer.current = created
    created.observe(editor.view.dom)
    for (const card of cards.current.values()) created.observe(card)
    if (label.current !== null) created.observe(label.current)
    return () => {
      cancelAnimationFrame(frame.current)
      created.disconnect()
      observer.current = null
    }
  }, [beside, editor])

  /** The reference of the element of a card, which the layout measures and watches. */
  const registerCard = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      const previous = cards.current.get(id)
      if (previous !== undefined) observer.current?.unobserve(previous)
      if (element === null) {
        cards.current.delete(id)
        return
      }
      cards.current.set(id, element)
      observer.current?.observe(element)
    },
    [],
  )
  const registerLabel = useCallback((element: HTMLElement | null) => {
    if (label.current !== null) observer.current?.unobserve(label.current)
    label.current = element
    if (element !== null) observer.current?.observe(element)
  }, [])

  return { plan, registerCard, registerLabel }
}

/**
 * The answer of `placeMargin` for the page as it is, or `null` when it cannot be measured yet: a card that is not in the page,
 * or a position the text no longer has (a transaction that the margin has not heard of yet). The observers and the next
 * render measure again.
 */
function measureMargin({
  editor,
  element,
  cards,
  label,
  placed,
  trailing,
  labelled,
}: Pick<MarginLayoutInput, 'editor' | 'placed' | 'trailing' | 'labelled'> & {
  element: HTMLElement
  cards: ReadonlyMap<string, HTMLElement>
  label: HTMLElement | null
}): MarginLayout | null {
  const origin = element.getBoundingClientRect().top
  const spacing = Number.parseFloat(getComputedStyle(element).rowGap) || 0
  const opened = [...editor.view.dom.children].flatMap((block) => {
    const gap = Number(block.getAttribute(commentGapAttribute))
    return gap > 0 ? [{ bottom: block.getBoundingClientRect().bottom, gap }] : []
  })

  const measured: MarginCard[] = []
  for (const { id, from } of placed) {
    const card = cards.get(id)
    const anchor = anchorTop(editor, from)
    if (card === undefined || anchor === null) return null
    // The gaps above the anchor are the room the text opened before: the anchor is where it would be without them.
    const above = opened.reduce((sum, { bottom, gap }) => (bottom <= anchor + 0.5 ? sum + gap : sum), 0)
    measured.push({
      id,
      block: editor.state.doc.resolve(from).index(0),
      top: Math.round(anchor - origin - above),
      height: Math.round(card.offsetHeight),
    })
  }
  const orphans = []
  for (const id of trailing) {
    const card = cards.get(id)
    if (card === undefined) return null
    orphans.push({ id, height: Math.round(card.offsetHeight) })
  }

  return placeMargin({
    cards: measured,
    orphans,
    spacing,
    orphanLabelHeight: labelled ? Math.round(label?.offsetHeight ?? 0) : 0,
  })
}

const planOf = ({ tops, orphanLabelTop, extent }: MarginLayout): MarginPlan => ({
  tops,
  labelTop: orphanLabelTop,
  extent,
})

const sameGaps = (a: ReadonlyMap<number, number>, b: ReadonlyMap<number, number>) =>
  a.size === b.size && [...a].every(([block, gap]) => b.get(block) === gap)

function samePlan(previous: MarginPlan | null, next: MarginLayout): boolean {
  return (
    previous !== null &&
    previous.extent === next.extent &&
    previous.labelTop === next.orphanLabelTop &&
    previous.tops.size === next.tops.size &&
    [...next.tops].every(([id, top]) => previous.tops.get(id) === top)
  )
}
