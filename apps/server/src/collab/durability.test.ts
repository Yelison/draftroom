import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { DocumentDurability, DurabilityRegistry, snapshotOf, type StoredSlot } from './durability.ts'

const loaded: StoredSlot = { snapshot: 'loaded', size: 10 }

const typed = (doc: Y.Doc, text: string) => doc.getText('t').insert(0, text)

describe('what is stored of a document', () => {
  it('is what was loaded, until a write commits', () => {
    expect(new DocumentDurability(loaded).lastStored).toBe(loaded)
  })

  it('is never what a failed write captured: the slot changes only when the write is committed', () => {
    const doc = new Y.Doc()
    const durable = new DocumentDurability(loaded)
    typed(doc, 'hello')
    const failed = durable.capture(doc)

    // The write failed, so nothing is committed: a client that connects now must not be told this snapshot.
    expect(durable.lastStored).toBe(loaded)

    durable.commit(failed)
    expect(durable.lastStored).toEqual({ snapshot: failed.snapshot, size: failed.size })
  })

  it('is the snapshot and the size of the state that was captured, from one run', () => {
    const doc = new Y.Doc()
    typed(doc, 'hello')
    const write = new DocumentDurability(loaded).capture(doc)

    expect(write.size).toBe(write.state.byteLength)
    expect(write.snapshot).toBe(snapshotOf(doc))
  })
})

describe('whether memory holds something the database does not', () => {
  it('is false for a document nobody has changed since it was loaded', () => {
    expect(new DocumentDurability(loaded).unconfirmed).toBe(false)
  })

  it('is true from the first change, and stays true after a capture that was not committed', () => {
    const doc = new Y.Doc()
    const durable = new DocumentDurability(loaded)
    durable.noteChange()
    durable.capture(doc)

    expect(durable.unconfirmed).toBe(true)
  })

  it('is false once a write that captured every change commits', () => {
    const doc = new Y.Doc()
    const durable = new DocumentDurability(loaded)
    durable.noteChange()

    durable.commit(durable.capture(doc))

    expect(durable.unconfirmed).toBe(false)
  })

  it('stays true when a change arrived while the write was in flight, because that change is not in what was written', () => {
    const doc = new Y.Doc()
    const durable = new DocumentDurability(loaded)
    durable.noteChange()
    const write = durable.capture(doc)
    durable.noteChange()

    durable.commit(write)

    expect(durable.unconfirmed).toBe(true)
  })
})

describe('the changes a document has stored', () => {
  it('counts the changes, and says that a mark is stored once a write that captured it is committed', () => {
    const doc = new Y.Doc()
    const durable = new DocumentDurability(loaded)
    durable.noteChange()
    durable.noteChange()
    const mark = durable.changeCount
    expect(durable.hasStored(mark)).toBe(false)

    const write = durable.capture(doc)
    expect(durable.hasStored(mark)).toBe(false)
    durable.commit(write)

    expect(mark).toBe(2)
    expect(durable.hasStored(mark)).toBe(true)
  })

  it('does not say that a change made after the mark was stored by a write that did not capture it', () => {
    const doc = new Y.Doc()
    const durable = new DocumentDurability(loaded)
    durable.noteChange()
    const mark = durable.changeCount
    durable.commit(durable.capture(doc))
    durable.noteChange()

    // The mark of the start is stored although the document has changed since: that is what lets a shutdown stop waiting.
    expect(durable.hasStored(mark)).toBe(true)
    expect(durable.hasStored(durable.changeCount)).toBe(false)
  })
})

describe('the registry of loaded documents', () => {
  it('counts the updates a document applies after it was loaded, and not the state it was loaded with', () => {
    const doc = new Y.Doc()
    typed(doc, 'loaded with this')
    const durable = new DurabilityRegistry().track(doc, 'doc:one', loaded)
    expect(durable.unconfirmed).toBe(false)

    typed(doc, 'typed later')

    expect(durable.unconfirmed).toBe(true)
  })

  it('remembers when a document last changed, by the clock it was given, and not when it was loaded', () => {
    let now = 1_000
    const doc = new Y.Doc()
    typed(doc, 'loaded with this')
    const durable = new DurabilityRegistry(() => now).track(doc, 'doc:one', loaded)
    expect(durable.lastChangeAt).toBeNull()

    now = 5_000
    typed(doc, 'typed later')
    now = 9_000

    expect(durable.lastChangeAt).toBe(5_000)
  })

  it('finds a document by name until it is forgotten', () => {
    const registry = new DurabilityRegistry()
    registry.track(new Y.Doc(), 'doc:one', loaded)
    expect(registry.get('doc:one')?.lastStored).toBe(loaded)

    registry.forget('doc:one')

    expect(registry.get('doc:one')).toBeUndefined()
  })

  it('is not shutting down until it is told so', () => {
    const registry = new DurabilityRegistry()
    expect(registry.shuttingDown).toBe(false)
    registry.beginShutdown()
    expect(registry.shuttingDown).toBe(true)
  })
})
