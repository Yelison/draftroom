import type { JSONContent } from '@tiptap/core'
import { jsonToYUpdate } from '@draftroom/editor-schema/convert'
import { describe, expect, it, vi } from 'vitest'
import { createExcerptUpdates, type ExcerptWriter } from './excerpt.ts'
import type { CollabLog } from './log.ts'

const paragraph = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content })
const text = (value: string): JSONContent => ({ type: 'text', text: value })
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })

describe('scheduling the update of an excerpt', () => {
  const state = (words: string): Uint8Array => jsonToYUpdate(doc(paragraph(text(words))))
  const silent: CollabLog = { info: () => undefined, warn: () => undefined, error: () => undefined }
  const nextMacrotask = () => new Promise((resolve) => setImmediate(resolve))

  /** A writer that records the excerpts it is given, and finishes each one when the test says so. */
  function heldWriter() {
    const calls: Array<{ documentId: string; excerpt: string | null }> = []
    const releases: Array<() => void> = []
    const writer: ExcerptWriter = {
      write: (documentId, excerpt) => {
        calls.push({ documentId, excerpt })
        return new Promise<void>((resolve) => releases.push(resolve))
      },
    }
    return { writer, calls, releases }
  }

  it('writes nothing in the turn that scheduled it, so the acknowledgement of the store goes first', async () => {
    const { writer, calls } = heldWriter()
    createExcerptUpdates(writer, silent).schedule('d1', state('First'))

    // Every microtask that was queued runs, the ones that send the acknowledgement among them, and the write is not one.
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve()
    expect(calls).toEqual([])
    await nextMacrotask()
    expect(calls).toEqual([{ documentId: 'd1', excerpt: 'First' }])
  })

  it('writes the excerpts of one document in the order they were stored, one after the other', async () => {
    const { writer, calls, releases } = heldWriter()
    const updates = createExcerptUpdates(writer, silent)
    updates.schedule('d1', state('Older'))
    updates.schedule('d1', state('Newer'))
    await nextMacrotask()

    expect(calls.map((call) => call.excerpt)).toEqual(['Older'])
    releases[0]?.()
    await vi.waitFor(() => expect(calls.map((call) => call.excerpt)).toEqual(['Older', 'Newer']))
  })

  it('does not make one document wait for another', async () => {
    const { writer, calls } = heldWriter()
    const updates = createExcerptUpdates(writer, silent)
    updates.schedule('d1', state('Stuck'))
    updates.schedule('d2', state('Free'))
    await nextMacrotask()

    expect(calls.map((call) => call.documentId)).toEqual(['d1', 'd2'])
  })

  it('logs a writer that fails, and a state it cannot read, and goes on with the next excerpt', async () => {
    const errors: object[] = []
    const written: Array<string | null> = []
    let failures = 1
    const writer: ExcerptWriter = {
      write: async (_documentId, excerpt) => {
        if (failures-- > 0) throw new Error('The database is down')
        written.push(excerpt)
      },
    }
    const updates = createExcerptUpdates(writer, { ...silent, error: (details) => errors.push(details) })

    updates.schedule('d1', state('Lost'))
    updates.schedule('d1', Uint8Array.of(255, 255, 255))
    updates.schedule('d1', state('Kept'))

    await vi.waitFor(() => expect(written).toEqual(['Kept']))
    expect(errors).toHaveLength(2)
    expect(errors[0]).toMatchObject({ documentId: 'd1' })
  })

  it('says when everything scheduled has been written, so a shutdown can wait before the database goes away', async () => {
    const { writer, calls, releases } = heldWriter()
    const updates = createExcerptUpdates(writer, silent)
    updates.schedule('d1', state('One'))
    updates.schedule('d2', state('Two'))
    let settled = false
    void updates.settled().then(() => (settled = true))

    await nextMacrotask()
    expect(calls).toHaveLength(2)
    expect(settled).toBe(false)
    for (const release of releases) release()
    await vi.waitFor(() => expect(settled).toBe(true))
  })
})
