import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { PendingChanges } from './PendingChanges.ts'

/** A client that records every update it makes as pending, and a server that applies them. */
function client() {
  const doc = new Y.Doc()
  const pending = new PendingChanges()
  const server = new Y.Doc()
  const updates: Uint8Array[] = []
  doc.on('update', (update: Uint8Array) => {
    pending.add(update)
    updates.push(update)
  })
  return {
    doc,
    pending,
    text: doc.getText('t'),
    /** What the server would have stored once it has applied the first `count` updates. */
    snapshotAfter(count: number) {
      const stored = new Y.Doc()
      for (const update of updates.slice(0, count)) Y.applyUpdate(stored, update)
      return Y.snapshot(stored)
    },
    server,
  }
}

describe('what is pending', () => {
  it('is nothing at first, and is contained in every snapshot', () => {
    const { pending, snapshotAfter } = client()

    expect(pending.isEmpty).toBe(true)
    expect(pending.isContainedIn(snapshotAfter(0))).toBe(true)
  })

  it('is contained in a snapshot only once the snapshot has every change', () => {
    const { pending, text, snapshotAfter } = client()
    text.insert(0, 'one')
    text.insert(3, ' two')

    expect(pending.isContainedIn(snapshotAfter(1))).toBe(false)
    expect(pending.isContainedIn(snapshotAfter(2))).toBe(true)
  })

  it('is not contained in a snapshot taken before a deletion, though a deletion adds no struct', () => {
    const { pending, text, snapshotAfter } = client()
    text.insert(0, 'hello world')
    pending.clear()
    text.delete(0, 6)

    expect(pending.isContainedIn(snapshotAfter(1))).toBe(false)
    expect(pending.isContainedIn(snapshotAfter(2))).toBe(true)
  })

  it('keeps every change across the batches in which updates are merged', () => {
    const { pending, text, snapshotAfter } = client()
    for (let key = 0; key < 1000; key += 1) text.insert(key, 'x')

    expect(pending.isContainedIn(snapshotAfter(999))).toBe(false)
    expect(pending.isContainedIn(snapshotAfter(1000))).toBe(true)
  })

  it('is nothing again once it is cleared', () => {
    const { pending, text } = client()
    text.insert(0, 'a')

    pending.clear()

    expect(pending.isEmpty).toBe(true)
  })
})
