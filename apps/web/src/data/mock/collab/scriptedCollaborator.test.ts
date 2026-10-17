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

  it('writes nothing more once she is stopped', () => {
    const { seat, edits } = scene()
    const stop = startCollaborator(seat, lines, lively)
    live(20_000)

    stop()
    const afterStopping = edits.length
    live(120_000)

    expect(edits).toHaveLength(afterStopping)
  })

  it('leaves the paragraph as she found it when she is stopped in the middle of a line, and starts clean again', () => {
    const { ydoc, seat } = scene()
    const stop = startCollaborator(seat, lines, lively)
    live(12_000)
    expect(hers(ydoc).length).toBeGreaterThan(label.length)

    stop()
    expect(hers(ydoc)).toBe(label)

    startCollaborator(seat, lines, lively)
    live(12_000)
    expect(hers(ydoc).startsWith(`${label} whether`)).toBe(true)
  })

  it('writes and erases only her own letters: what a visitor wrote at the end of her paragraph stays', () => {
    const { ydoc, seat, cursors } = scene()
    const visitor = new Y.Doc()
    Y.applyUpdate(visitor, Y.encodeStateAsUpdate(ydoc))
    ydoc.on(
      'update',
      (update: Uint8Array, origin: unknown) => origin !== 'visitor' && Y.applyUpdate(visitor, update, 'her'),
    )
    visitor.on(
      'update',
      (update: Uint8Array, origin: unknown) => origin !== 'her' && Y.applyUpdate(ydoc, update, 'visitor'),
    )
    const stop = startCollaborator(seat, lines, lively)
    live(12_000)

    // The visitor writes after her letters, with their cursor there, and then goes to another paragraph.
    const text = blocks(visitor).at(-1)
    const visitorsText = text instanceof Y.XmlElement ? text.get(0) : undefined
    if (!(visitorsText instanceof Y.XmlText)) throw new Error('The last paragraph has no text')
    visitor.transact(() => visitorsText.insert(visitorsText.length, ' VISITOR NOTE'), 'visitor')
    cursors.push(Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(visitorsText, visitorsText.length)))
    live(4_000)
    cursors.length = 0
    // She gives up the line she had begun, and does not go on writing after the visitor's words.
    live(3_000)
    expect(hers(ydoc)).toBe(`${label} VISITOR NOTE`)
    live(300_000)
    stop()

    expect(hers(ydoc)).toBe(`${label} VISITOR NOTE`)
  })

  it('takes her place with reduced motion once the document has arrived', () => {
    const ydoc = new Y.Doc()
    const shown: Y.RelativePosition[] = []
    startCollaborator({ ydoc, otherCursors: () => [], showCursor: (position) => shown.push(position) }, lines, {
      ...lively,
      reducedMotion: () => true,
    })
    live(5_000)
    expect(shown).toHaveLength(0)

    Y.applyUpdate(ydoc, jsonToYUpdate({ type: 'doc', content: [...(demoContent.en[launchPlan.id] ?? [])] }))
    live(1_000)

    expect(shown).toHaveLength(1)
  })

  it('goes on in the new last paragraph when hers is deleted and another is added, as when a version is restored', () => {
    const { ydoc, seat } = scene()
    startCollaborator(seat, lines, lively)
    live(12_000)
    const fragment = ydoc.getXmlFragment(fragmentName)

    fragment.delete(fragment.length - 1, 1)
    live(3_000)
    // A document of the demo is only ever written from JSON; this is the one place a test makes a paragraph by hand.
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText('Restored notes:')])
    const seen = new Set<string>()
    ydoc.on('update', () => seen.add(hers(ydoc)))
    fragment.insert(fragment.length, [paragraph])
    live(60_000)

    expect([...seen].some((state) => state.startsWith('Restored notes: whether'))).toBe(true)
  })
})
