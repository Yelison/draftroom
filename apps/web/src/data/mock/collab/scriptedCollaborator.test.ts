import { fragmentName } from '@draftroom/editor-schema'
// oxlint-disable-next-line no-restricted-imports
import { jsonToYUpdate } from '@draftroom/editor-schema/convert'
import * as Y from 'yjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { demoContent } from '../fixtures/demoContent.ts'
import { launchPlan } from '../fixtures/documents.ts'
import type { ScriptLine } from '../fixtures/collaboratorScripts.ts'
import { startCollaborator, type CollaboratorSeat } from './scriptedCollaborator.ts'

const lines: readonly ScriptLine[] = [
  { draft: ' whether the trial stays at two weeks.', final: ' whether the trial stays at two weeks or grows.' },
]

function openDocument(): Y.Doc {
  const ydoc = new Y.Doc()
  Y.applyUpdate(ydoc, jsonToYUpdate({ type: 'doc', content: [...(demoContent.en[launchPlan.id] ?? [])] }))
  return ydoc
}

const blocks = (ydoc: Y.Doc) => ydoc.getXmlFragment(fragmentName).toArray()
const paragraphOf = (node: Y.XmlElement | Y.XmlText | Y.XmlHook | undefined) =>
  node instanceof Y.XmlElement && node.get(0) instanceof Y.XmlText ? node.get(0)?.toString() : undefined
const hers = (ydoc: Y.Doc) => paragraphOf(blocks(ydoc).at(-1)) ?? ''
const label = 'Still open after the pricing review:'

interface Scene {
  ydoc: Y.Doc
  seat: CollaboratorSeat
  cursors: unknown[]
  shown: Y.RelativePosition[]
  edits: number[]
}

function scene(): Scene {
  const ydoc = openDocument()
  const cursors: unknown[] = []
  const shown: Y.RelativePosition[] = []
  const edits: number[] = []
  ydoc.on('update', () => edits.push(Date.now()))
  return { ydoc, cursors, shown, edits, seat: { ydoc, otherCursors: () => cursors, showCursor: (p) => shown.push(p) } }
}

const lively = { random: () => 0.5, reducedMotion: () => false }

/** Lets a person of the fake clock go on for `ms`, in the small steps of their own timers. */
const live = (ms: number) => vi.advanceTimersByTime(ms)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the collaborator of the demo', () => {
  it('types her line a letter at a time, in the last paragraph, at the pace of a person', () => {
    const { ydoc, seat, edits } = scene()
    startCollaborator(seat, lines, lively)

    live(30_000)

    expect(hers(ydoc).startsWith(`${label} whether`)).toBe(true)
    expect(edits.length).toBeGreaterThan(20)
    const gaps = edits.slice(1).map((at, index) => at - (edits[index] ?? at))
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(40)
  })

  it('rewrites the end of a line and erases it, leaving the paragraph as she found it', () => {
    const { ydoc, seat } = scene()
    const seen = new Set<string>()
    ydoc.on('update', () => seen.add(hers(ydoc)))
    startCollaborator(seat, lines, lively)

    live(120_000)

    expect(seen).toContain(`${label}${lines[0]?.draft}`)
    expect(seen).toContain(`${label}${lines[0]?.final}`)
    expect(seen).toContain(label)
  })

  it('writes nowhere else: every other paragraph is as it was', () => {
    const { ydoc, seat } = scene()
    const before = blocks(ydoc).slice(0, -1).map(String)
    startCollaborator(seat, lines, lively)

    live(120_000)

    expect(blocks(ydoc).slice(0, -1).map(String)).toEqual(before)
  })

  it('moves her cursor with every letter she types or erases', () => {
    const { ydoc, seat, shown } = scene()
    startCollaborator(seat, lines, lively)
    let length = hers(ydoc).length
    const withoutCursor: number[] = []

    for (let step = 0; step < 600; step += 1) {
      const shownBefore = shown.length
      live(100)
      const now = hers(ydoc).length
      if (now !== length && shown.length === shownBefore) withoutCursor.push(step)
      length = now
    }

    expect(withoutCursor).toEqual([])
    expect(shown.length).toBeGreaterThan(20)
  })

  it('does not type while the cursor of someone else is in her paragraph, and goes on when it leaves', () => {
    const { ydoc, seat, cursors } = scene()
    const target = blocks(ydoc).at(-1)
    const text = target instanceof Y.XmlElement ? target.get(0) : undefined
    if (!(text instanceof Y.XmlText)) throw new Error('The last paragraph has no text')
    const visitor = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 5))
    cursors.push(visitor)
    startCollaborator(seat, lines, lively)

    live(60_000)
    expect(hers(ydoc)).toBe(label)

    cursors.length = 0
    live(60_000)
    expect(hers(ydoc).length).toBeGreaterThan(label.length)
  })

  it('stays present and writes nothing when the person asked for less motion', () => {
    const { ydoc, seat, shown } = scene()
    startCollaborator(seat, lines, { ...lively, reducedMotion: () => true })

    live(120_000)

    expect(hers(ydoc)).toBe(label)
    expect(shown).toHaveLength(1)
  })

  it('stops when she is told to', () => {
    const { ydoc, seat } = scene()
    const stop = startCollaborator(seat, lines, lively)
    live(20_000)
    const written = hers(ydoc)

    stop()
    live(120_000)

    expect(hers(ydoc)).toBe(written)
  })
})
