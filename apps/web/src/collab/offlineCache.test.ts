import * as Y from 'yjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LOAD_TIMEOUT_MS,
  copiesOf,
  copyName,
  hasUnstoredChanges,
  openLocalCopy,
  purgeCopies,
  type CopyKey,
  type LocalCopy,
} from './offlineCache.ts'
import { withFreshIndexedDb } from './testing/fakeIndexedDb.ts'

withFreshIndexedDb()
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const aCopy: CopyKey = { userId: 'u1', workspaceId: 'w1', documentId: 'd1' }

async function open(key: CopyKey = aCopy): Promise<{ copy: LocalCopy; doc: Y.Doc }> {
  const doc = new Y.Doc()
  const copy = await openLocalCopy(key, doc)
  if (copy === null) throw new Error('The copy should have opened')
  return { copy, doc }
}

/** The text of a document is what a copy brings back; writing is what makes the copy hold anything. */
const write = (doc: Y.Doc, text: string) => doc.getText('t').insert(0, text)
const textOf = (doc: Y.Doc) => doc.getText('t').toString()

/** Closes a copy and waits for its connection to the database to be over, as a page that is left does. */
async function leave({ copy }: { copy: LocalCopy }) {
  copy.close()
  await settle()
}

/** Lets the writes that were started finish: the copy does not say when they are done. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('the name of a copy', () => {
  it.each([
    { case: 'is the account, the workspace and the document', key: aCopy, name: 'draftroom:u1:w1:d1' },
    { case: 'differs by account', key: { ...aCopy, userId: 'u2' }, name: 'draftroom:u2:w1:d1' },
    { case: 'differs by workspace', key: { ...aCopy, workspaceId: 'w2' }, name: 'draftroom:u1:w2:d1' },
    { case: 'differs by document', key: { ...aCopy, documentId: 'd2' }, name: 'draftroom:u1:w1:d2' },
  ])('$case', ({ key, name }) => {
    expect(copyName(key)).toBe(name)
  })
})

describe('opening a copy', () => {
  it('has nothing to show for a document the person never opened here', async () => {
    const { copy } = await open()

    expect(copy.hadContent).toBe(false)
    expect(copy.hadUnstoredChanges).toBe(false)
  })

  it('brings back what the document held, in a new document, once it is opened again', async () => {
    const first = await open()
    write(first.doc, 'Written on this device')
    await leave(first)

    const second = await open()

    expect(second.copy.hadContent).toBe(true)
    expect(textOf(second.doc)).toBe('Written on this device')
  })

  it('keeps the copies of two accounts apart', async () => {
    const first = await open()
    write(first.doc, 'Marta wrote this')
    await leave(first)

    const other = await open({ ...aCopy, userId: 'u2' })

    expect(other.copy.hadContent).toBe(false)
    expect(textOf(other.doc)).toBe('')
  })

  it.each([
    { case: 'there is none', arrange: () => vi.stubGlobal('indexedDB', undefined) },
    {
      case: 'reading it is refused, as a browser that blocks the site data does',
      arrange: () =>
        Object.defineProperty(globalThis, 'indexedDB', {
          configurable: true,
          get: () => {
            throw new DOMException('The operation is insecure.', 'SecurityError')
          },
        }),
    },
  ])('is not opened, and not waited for, where $case', async ({ arrange }) => {
    // The clock does not move: an answer that waited for the storage would never come.
    vi.useFakeTimers()
    arrange()

    await expect(openLocalCopy(aCopy, new Y.Doc())).resolves.toBeNull()
  })

  it('gives up on storage that never answers, so the document still opens from the server', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('indexedDB', { open: () => ({}) })

    const opening = openLocalCopy(aCopy, new Y.Doc())
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS)

    await expect(opening).resolves.toBeNull()
  })
})

describe('the marker of changes that were never stored', () => {
  it('is set by the copy itself with a change of the person, and is there when it is opened again', async () => {
    const first = await open()
    write(first.doc, 'Not stored yet')
    await leave(first)

    const second = await open()

    expect(second.copy.hadUnstoredChanges).toBe(true)
  })

  it('is not set by what the server sends', async () => {
    const first = await open()
    const server = new Y.Doc()
    write(server, 'Written by someone else')
    Y.applyUpdate(first.doc, Y.encodeStateAsUpdate(server))
    await leave(first)

    const second = await open()

    expect(second.copy.hadContent).toBe(true)
    expect(second.copy.hadUnstoredChanges).toBe(false)
  })

  it('is committed before the change it describes, in a transaction that reaches the updates', async () => {
    const { doc } = await open()
    const transactions = vi.spyOn(IDBDatabase.prototype, 'transaction')

    write(doc, 'Not stored yet')
    await settle()

    const created = transactions.mock.calls.map(([stores, mode]) => ({ stores: [stores].flat(), mode }))
    const marking = created.findIndex(({ stores }) => stores.includes('custom') && stores.includes('updates'))
    const writing = created.findIndex(({ stores }) => stores.length === 1 && stores[0] === 'updates')
    expect(created[marking]?.mode).toBe('readwrite')
    // IndexedDB runs transactions that overlap in the order they were created: the marker cannot be lost behind the change.
    expect(marking).toBeGreaterThanOrEqual(0)
    expect(writing).toBeGreaterThan(marking)
  })

  it('is gone when the server stored everything the copy holds', async () => {
    const first = await open()
    write(first.doc, 'Stored since')

    await first.copy.settle(Y.snapshot(first.doc))
    await leave(first)

    const second = await open()
    expect(second.copy.hadUnstoredChanges).toBe(false)
  })

  it('stays when what the server stored lacks a change', async () => {
    const first = await open()
    write(first.doc, 'Stored')
    const stored = Y.snapshot(first.doc)
    write(first.doc, 'Not stored')

    await first.copy.settle(stored)
    await leave(first)

    const second = await open()
    expect(second.copy.hadUnstoredChanges).toBe(true)
  })

  it('stays when another tab wrote what the snapshot lacks, though this tab has nothing else pending', async () => {
    const thisTab = await open()
    const otherTab = await open()
    write(thisTab.doc, 'Written here')
    const stored = Y.snapshot(thisTab.doc)
    write(otherTab.doc, 'Written there')
    await settle()

    await thisTab.copy.settle(stored)

    expect(await hasUnstoredChanges(copyName(aCopy))).toBe(true)
  })

  it('is not forgotten because of a change made while the copy was being read, and goes once a snapshot covers it all', async () => {
    const { copy, doc } = await open()
    write(doc, 'First')
    await settle()
    const stored = Y.snapshot(doc)

    // Written in the same turn as the reading: it marks the copy again after the marker was deleted, and it is not in what
    // was read, so nothing may conclude that the copy holds nothing unstored any more.
    const settling = copy.settle(stored)
    write(doc, 'Second')
    await settling
    await settle()
    expect(await hasUnstoredChanges(copyName(aCopy))).toBe(true)

    await copy.settle(Y.snapshot(doc))
    await settle()

    expect(await hasUnstoredChanges(copyName(aCopy))).toBe(false)
  })

  it('is set again by the next change of a tab after another tab cleared it', async () => {
    const thisTab = await open()
    const otherTab = await open()
    write(thisTab.doc, 'Written here')
    write(otherTab.doc, 'Written there')
    const everything = new Y.Doc()
    Y.applyUpdate(everything, Y.encodeStateAsUpdate(thisTab.doc))
    Y.applyUpdate(everything, Y.encodeStateAsUpdate(otherTab.doc))
    await settle()
    await otherTab.copy.settle(Y.snapshot(everything))
    expect(await hasUnstoredChanges(copyName(aCopy))).toBe(false)

    write(thisTab.doc, 'And some more')
    await settle()

    expect(await hasUnstoredChanges(copyName(aCopy))).toBe(true)
  })

  it('is read without loading the copy, and without creating one that does not exist', async () => {
    const { doc } = await open()
    write(doc, 'Not stored yet')
    await settle()

    expect(await hasUnstoredChanges(copyName(aCopy))).toBe(true)
    expect(await hasUnstoredChanges('draftroom:u1:w1:never-opened')).toBe(false)
    expect((await indexedDB.databases()).map(({ name }) => name)).toEqual([copyName(aCopy)])
  })
})

describe('the copies of an account', () => {
  it('are listed by the account alone: the copies of u1 are not those of u10', async () => {
    for (const userId of ['u1', 'u10']) await leave(await open({ ...aCopy, userId }))

    expect(await copiesOf('u1')).toEqual(['draftroom:u1:w1:d1'])
    expect(await copiesOf('u10')).toEqual(['draftroom:u10:w1:d1'])
  })

  it('are deleted, and only the ones that were named', async () => {
    await leave(await open())
    await leave(await open({ ...aCopy, documentId: 'd2' }))

    await purgeCopies(['draftroom:u1:w1:d1'])

    expect(await copiesOf('u1')).toEqual(['draftroom:u1:w1:d2'])
  })

  it('stop following their documents when they are deleted while open: what is written after is not kept', async () => {
    const { doc } = await open()
    write(doc, 'Before')

    await purgeCopies([copyName(aCopy)])
    write(doc, 'After')
    await settle()

    expect(await copiesOf('u1')).toEqual([])
  })
})

describe('purging one copy', () => {
  it('leaves nothing of the document to load when it is opened again at once', async () => {
    const { copy, doc } = await open()
    write(doc, 'Written before access was removed')

    // Not awaited: the document is opened again while the deletion is still going on, as it is when the screen starts over.
    void copy.purge()
    const again = await open()

    expect(textOf(again.doc)).toBe('')
    expect(again.copy.hadContent).toBe(false)
    expect(again.copy.hadUnstoredChanges).toBe(false)
  })
})
