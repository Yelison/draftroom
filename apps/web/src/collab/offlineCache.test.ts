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
afterEach(() => vi.useRealTimers())

const launchPlan: CopyKey = { userId: 'u1', workspaceId: 'w1', documentId: 'd1' }

async function open(key: CopyKey = launchPlan): Promise<{ copy: LocalCopy; doc: Y.Doc }> {
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
    { case: 'is the account, the workspace and the document', key: launchPlan, name: 'draftroom:u1:w1:d1' },
    { case: 'differs by account', key: { ...launchPlan, userId: 'u2' }, name: 'draftroom:u2:w1:d1' },
    { case: 'differs by workspace', key: { ...launchPlan, workspaceId: 'w2' }, name: 'draftroom:u1:w2:d1' },
    { case: 'differs by document', key: { ...launchPlan, documentId: 'd2' }, name: 'draftroom:u1:w1:d2' },
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

    const other = await open({ ...launchPlan, userId: 'u2' })

    expect(other.copy.hadContent).toBe(false)
    expect(textOf(other.doc)).toBe('')
  })

  it('is not opened at all in a browser that keeps nothing for the page', async () => {
    vi.stubGlobal('indexedDB', undefined)

    await expect(openLocalCopy(launchPlan, new Y.Doc())).resolves.toBeNull()

    vi.unstubAllGlobals()
  })

  it('gives up on storage that never answers, so the document still opens from the server', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('indexedDB', { open: () => ({}) })

    const opening = openLocalCopy(launchPlan, new Y.Doc())
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS)

    await expect(opening).resolves.toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('the marker of changes that were never stored', () => {
  it('is kept with the copy, and is there when it is opened again', async () => {
    const first = await open()
    write(first.doc, 'Not stored yet')
    first.copy.markUnsynced()
    await leave(first)

    const second = await open()

    expect(second.copy.hadUnstoredChanges).toBe(true)
  })

  it('is gone once it is cleared', async () => {
    const first = await open()
    write(first.doc, 'Stored since')
    first.copy.markUnsynced()
    first.copy.clearUnsynced()
    await leave(first)

    const second = await open()

    expect(second.copy.hadUnstoredChanges).toBe(false)
  })

  it('is read without loading the copy, and without creating one that does not exist', async () => {
    const { copy, doc } = await open()
    write(doc, 'Not stored yet')
    copy.markUnsynced()
    await settle()

    expect(await hasUnstoredChanges(copyName(launchPlan))).toBe(true)
    expect(await hasUnstoredChanges('draftroom:u1:w1:never-opened')).toBe(false)
    expect((await indexedDB.databases()).map(({ name }) => name)).toEqual([copyName(launchPlan)])
  })
})

describe('the copies of an account', () => {
  it('are listed by the account alone: the copies of u1 are not those of u10', async () => {
    for (const userId of ['u1', 'u10']) await leave(await open({ ...launchPlan, userId }))

    expect(await copiesOf('u1')).toEqual(['draftroom:u1:w1:d1'])
    expect(await copiesOf('u10')).toEqual(['draftroom:u10:w1:d1'])
  })

  it('are deleted, and only the ones that were named', async () => {
    await leave(await open())
    await leave(await open({ ...launchPlan, documentId: 'd2' }))

    await purgeCopies(['draftroom:u1:w1:d1'])

    expect(await copiesOf('u1')).toEqual(['draftroom:u1:w1:d2'])
  })

  it('stop following their documents when they are deleted while open: what is written after is not kept', async () => {
    const { doc } = await open()
    write(doc, 'Before')

    await purgeCopies([copyName(launchPlan)])
    write(doc, 'After')
    await settle()

    expect(await copiesOf('u1')).toEqual([])
  })
})

describe('purging one copy', () => {
  it('leaves nothing of the document to load when it is opened again at once', async () => {
    const { copy, doc } = await open()
    write(doc, 'Written before access was removed')
    copy.markUnsynced()

    // Not awaited: the document is opened again while the deletion is still going on, as it is when the screen starts over.
    void copy.purge()
    const again = await open()

    expect(textOf(again.doc)).toBe('')
    expect(again.copy.hadContent).toBe(false)
    expect(again.copy.hadUnstoredChanges).toBe(false)
  })
})
