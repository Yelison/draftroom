import { MAX_MESSAGE_BYTES } from '@draftroom/contract/collab'
import * as Y from 'yjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toBase64 } from './base64.ts'
import { copiesOf, hasUnstoredChanges } from './offlineCache.ts'
import { withFreshIndexedDb } from './testing/fakeIndexedDb.ts'
import {
  advance,
  createWorld,
  editor,
  reader,
  textOf,
  typeInto,
  wireName,
  type Opened,
  type World,
} from './testing/sessionWorld.ts'
import type { Identity } from '../data/mock/collab/SimulatedCollabServer.ts'

// What the device keeps of a document, through the session and the simulated server, with fake clocks: what is checked
// is what the person is told and what reaches the server, and what is left on the device, never the internals.

withFreshIndexedDb()

let world: World
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  world.dispose()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Opens the document the way the app does, with a copy kept on the device, and lets the connection finish. */
async function opened(who: Identity = editor): Promise<Opened> {
  const result = world.open(who, { keepCopy: true })
  await advance(100)
  return result
}

/** Leaves the screen and comes back to it, as a reload does: a new session, on the same device, to the same server. */
async function reopened(opening: Opened, who: Identity = editor): Promise<Opened> {
  opening.session.destroy()
  await advance(50)
  return opened(who)
}

const state = ({ session }: Opened) => session.getSnapshot().state

/** What the browser's storage says. It answers on the clock the tests drive, so the answer is waited for like anything else. */
async function onDevice<T>(read: () => Promise<T>): Promise<T> {
  const answer = read()
  await advance(50)
  return answer
}

const copiesOnDevice = (who: Identity = editor) => onDevice(() => copiesOf(who.userId))

async function documentsWithUnstoredChanges(who: Identity = editor): Promise<number> {
  const names = await copiesOnDevice(who)
  const flags = await onDevice(() => Promise.all(names.map(hasUnstoredChanges)))
  return flags.filter(Boolean).length
}

describe('the marker of changes that were never stored', () => {
  it('is set while what the person wrote is not stored and cleared when a stored event that covers it arrives', async () => {
    world = createWorld()
    const opening = await opened()
    expect(await documentsWithUnstoredChanges()).toBe(0)
    world.server.holdStores()

    typeInto(opening.doc, 'written, not stored yet')
    await advance(100)
    expect(state(opening)).toBe('synchronising')
    expect(await documentsWithUnstoredChanges()).toBe(1)

    world.server.releaseStores()
    await advance(1100)
    expect(state(opening)).toBe('synced')
    expect(await documentsWithUnstoredChanges()).toBe(0)
  })

  it('stays set when the stored event that arrives was taken before a deletion', async () => {
    world = createWorld()
    const opening = await opened()
    typeInto(opening.doc, 'hello world')
    await advance(1100)
    const before = toBase64(Y.encodeSnapshot(Y.snapshot(world.server.document(wireName))))
    world.server.holdStores()

    opening.doc.getText('t').delete(0, 6)
    await advance(100)
    world.server.broadcast(wireName, { type: 'stored', snapshot: before })
    await advance(100)

    expect(await documentsWithUnstoredChanges()).toBe(1)
  })

  it('is set for what is written offline and is still set after the page was left', async () => {
    world = createWorld()
    const opening = await opened()
    world.network.set(false)
    typeInto(opening.doc, 'written offline')
    await advance(100)

    opening.session.destroy()
    await advance(50)

    expect(await documentsWithUnstoredChanges()).toBe(1)
  })
})

describe('opening a document from the copy of this device', () => {
  it('shows what was written offline without a connection, and sends it once the connection is back', async () => {
    world = createWorld()
    const first = await opened()
    world.network.set(false)
    typeInto(first.doc, 'written offline')
    await advance(100)

    const again = await reopened(first)

    expect(state(again)).toBe('offline-local')
    expect(textOf(again.doc)).toBe('written offline')
    expect(again.session.getSnapshot()).toMatchObject({ editable: true, loaded: true })
    expect(world.server.connectionsTo(wireName)).toBe(0)

    world.network.set(true)
    await advance(100)
    // The server has it and has not stored it: not synced, and not called saved.
    expect(state(again)).toBe('synchronising')
    await advance(1100)
    expect(state(again)).toBe('synced')
    expect(textOf(world.server.document(wireName))).toBe('written offline')
    expect(await documentsWithUnstoredChanges()).toBe(0)
  })

  it('does not say synced for what it holds until the server says it stored it', async () => {
    world = createWorld()
    const first = await opened()
    world.network.set(false)
    typeInto(first.doc, 'written offline')
    await advance(100)
    world.network.set(true)
    world.server.holdStores()

    const again = await reopened(first)
    await advance(2000)

    expect(textOf(world.server.document(wireName))).toBe('written offline')
    expect(state(again)).toBe('synchronising')
  })

  it('opens from the server alone where the browser keeps nothing for the page', async () => {
    world = createWorld()
    vi.stubGlobal('indexedDB', undefined)

    const opening = await opened()
    typeInto(opening.doc, 'written without a copy')
    await advance(1100)

    expect(state(opening)).toBe('synced')
    expect(textOf(world.server.document(wireName))).toBe('written without a copy')
  })

  it('does not turn what a reader opens again into changes of their own, and does not tell them anything was lost', async () => {
    world = createWorld()
    const first = await opened(reader)
    typeInto(world.server.document(wireName), 'written by someone else')
    await advance(100)
    const generation = first.session.getSnapshot().generation

    const again = await reopened(first, reader)

    expect(again.session.getSnapshot()).toMatchObject({ state: 'read-only', notice: null })
    expect(again.session.getSnapshot().generation).toBe(generation)
    expect(textOf(again.doc)).toBe('written by someone else')
    expect(world.server.updatesFromReaders).toBe(0)
    expect(await copiesOnDevice(reader)).toHaveLength(1)
  })
})

describe('when access is removed during an outage', () => {
  it('purges the copy without asking, and never sends what was written offline', async () => {
    world = createWorld()
    const opening = await opened()
    world.network.set(false)
    typeInto(opening.doc, 'written offline, after access was gone')
    await advance(100)
    world.setAccess(editor, { denied: 'not-found' })

    world.network.set(true)
    await advance(1100)

    expect(state(opening)).toBe('revoked')
    expect(await copiesOnDevice()).toEqual([])
    expect(textOf(world.server.document(wireName))).toBe('')
    expect(world.server.connectionsTo(wireName)).toBe(0)

    // Nothing of it comes back when access does: not from the copy, and not from the page.
    world.setAccess(editor, { scope: 'read-write' })
    const later = await reopened(opening)
    await advance(1100)

    expect(textOf(later.doc)).toBe('')
    expect(textOf(world.server.document(wireName))).toBe('')
  })

  it('purges the copy when the server closes the connection with access removed, with the page open', async () => {
    world = createWorld()
    const opening = await opened()
    typeInto(opening.doc, 'typed')
    await advance(1100)
    world.setAccess(editor, { denied: 'not-found' })

    world.server.closeConnections(4403, 'access-revoked')
    await advance(100)

    expect(state(opening)).toBe('revoked')
    expect(await copiesOnDevice()).toEqual([])
  })

  it('keeps nothing written after the access was removed', async () => {
    world = createWorld()
    const opening = await opened()
    world.setAccess(editor, { denied: 'not-found' })
    world.server.closeConnections(4403, 'access-revoked')
    await advance(100)

    typeInto(opening.doc, 'typed after it')
    await advance(100)

    expect(await copiesOnDevice()).toEqual([])
  })
})

describe('when the role becomes reader during an outage', () => {
  it('drops the copy with the changes that were not accepted, says so, and does not bring them back later', async () => {
    world = createWorld()
    const opening = await opened()
    typeInto(opening.doc, 'stored text')
    await advance(1100)
    world.network.set(false)
    typeInto(opening.doc, 'offline ', 0)
    await advance(100)
    world.setAccess(editor, { scope: 'readonly' })

    world.network.set(true)
    await advance(100)

    expect(opening.session.getSnapshot()).toMatchObject({ state: 'read-only', notice: 'offline-changes-discarded' })
    expect(textOf(opening.doc)).toBe('stored text')
    expect(await documentsWithUnstoredChanges()).toBe(0)

    const later = await reopened(opening)
    expect(textOf(later.doc)).toBe('stored text')
    expect(later.session.getSnapshot().notice).toBeNull()
  })
})

describe('when a document is too large', () => {
  it('deletes the copy when the person discards and reloads, so the document does not load what caused it again', async () => {
    world = createWorld()
    const opening = await opened()
    typeInto(opening.doc, 'z'.repeat(MAX_MESSAGE_BYTES + 1000))
    await advance(100)
    expect(opening.session.getSnapshot()).toMatchObject({ state: 'error', cause: 'document-too-large' })

    opening.session.discardAndReload()
    await advance(1100)

    expect(opening.session.getSnapshot().state).toBe('synced')
    expect(textOf(opening.doc)).toBe('')
    const later = await reopened(opening)
    expect(textOf(later.doc)).toBe('')
    expect(later.session.getSnapshot().state).toBe('synced')
  })
})
