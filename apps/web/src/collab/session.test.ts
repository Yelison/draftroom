import {
  MAX_MESSAGE_BYTES,
  MAX_UNSENT_BYTES,
  RECONNECT_STABLE_MS,
  STORED_ACK_TIMEOUT_MS,
  type StatelessEvent,
} from '@draftroom/contract/collab'
import * as Y from 'yjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toBase64 } from './base64.ts'
import {
  advance,
  createWorld,
  editor,
  reader,
  stranger,
  textOf,
  typeInto,
  wireName,
  type Opened,
  type World,
} from './testing/sessionWorld.ts'

// The session is run against the simulated server through the real provider, with fake clocks: what is checked is
// what the person is told and what reaches the server, never the internals of either.

let world: World
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  world.dispose()
  vi.useRealTimers()
})

/** Opens the document as `who` and lets the connection and the handshake finish. */
async function opened(...args: Parameters<World['open']>): Promise<Opened> {
  const result = world.open(...args)
  await advance(50)
  return result
}

const state = ({ session }: Opened) => session.getSnapshot().state
const socketOf = ({ session }: Opened) => session.getSnapshot().provider.configuration.websocketProvider

/** Types, and lets the server acknowledge and store it. */
async function typeAndStore(opening: Opened, text: string) {
  typeInto(opening.doc, text)
  await advance(1100)
}

const snapshotOf = (doc: Y.Doc) => toBase64(Y.encodeSnapshot(Y.snapshot(doc)))

describe('opening a document', () => {
  it('treats a failure of the server while it authenticates as a reconnection: editable, retried by itself, nothing purged', async () => {
    world = createWorld()
    const opening = await opened()
    typeInto(opening.doc, 'kept')
    world.setAccess(editor, { denied: 'unavailable' })

    world.server.closeConnections(4429, 'rate-limited')
    await advance(1100)
    expect(opening.session.getSnapshot()).toMatchObject({ state: 'reconnecting', cause: null, editable: true })
    // It goes on trying with the back-off of section 6.5, never giving up and never asking the person to retry.
    await advance(2100)
    await advance(4100)
    expect(opening.session.getSnapshot()).toMatchObject({ state: 'reconnecting', editable: true })
    typeInto(opening.doc, ' and more', 4)

    world.setAccess(editor, { scope: 'read-write' })
    await advance(8100)
    await advance(1100)
    expect(state(opening)).toBe('synced')
    expect(textOf(world.server.document(wireName))).toBe('kept and more')
  })
})

describe('what is said to be stored', () => {
  it('does not take a deletion as stored because of a snapshot taken before it', async () => {
    world = createWorld()
    const opening = await opened()
    await typeAndStore(opening, 'hello world')
    const before = snapshotOf(world.server.document(wireName))
    world.server.holdStores()

    opening.doc.getText('t').delete(0, 6)
    await advance(100)
    // A `stored` that was in flight when the deletion arrived: its snapshot has every struct and not the deletion.
    world.server.broadcast(wireName, { type: 'stored', snapshot: before })
    await advance(100)

    expect(state(opening)).toBe('synchronising')
    world.server.releaseStores()
    await advance(1100)
    expect(state(opening)).toBe('synced')
  })

  it('is synced at once for a document that holds what others wrote and the server has not stored yet', async () => {
    world = createWorld()
    world.server.holdStores()
    typeInto(world.server.document(wireName), 'written by someone else')

    const opening = await opened()

    // Nothing of its own is waiting to be stored, so the person is not told it is synchronising.
    expect(textOf(opening.doc)).toBe('written by someone else')
    expect(opening.session.getSnapshot().state).toBe('synced')
  })

  it('waits for the provider as well as for the server: a covering stored before the acknowledgement is remembered', async () => {
    world = createWorld()
    const opening = await opened()
    const { provider } = opening.session.getSnapshot()
    provider.incrementUnsyncedChanges()
    expect(state(opening)).toBe('synchronising')

    world.server.broadcast(wireName, { type: 'stored', snapshot: snapshotOf(world.server.document(wireName)) })
    await advance(100)
    expect(state(opening)).toBe('synchronising')

    provider.decrementUnsyncedChanges()
    expect(state(opening)).toBe('synced')
  })

  it('counts the wait from the last change: a second change starts the 15 seconds over', async () => {
    world = createWorld()
    const opening = await opened()
    world.server.holdStores()

    typeInto(opening.doc, 'one')
    await advance(10_000)
    typeInto(opening.doc, ' two', 3)
    await advance(10_000)
    expect(state(opening)).toBe('synchronising')

    await advance(STORED_ACK_TIMEOUT_MS - 10_000 + 100)
    expect(state(opening)).toBe('error')
  })

  it('reopens the provider when the person retries after a store error with the socket still open, and ends synced', async () => {
    world = createWorld()
    const opening = await opened()
    world.server.failStores(true)
    typeInto(opening.doc, 'hello')
    await advance(STORED_ACK_TIMEOUT_MS + 100)
    const socket = socketOf(opening)
    const disconnect = vi.spyOn(socket, 'disconnect')
    const connect = vi.spyOn(socket, 'connect')
    world.server.failStores(false)

    opening.session.retry()
    expect(state(opening)).toBe('connecting')
    await advance(50)

    expect(disconnect.mock.invocationCallOrder[0]).toBeLessThan(connect.mock.invocationCallOrder[0] ?? 0)
    expect(state(opening)).toBe('synchronising')
    await advance(2000)
    expect(state(opening)).toBe('synced')
    expect(textOf(world.server.document(wireName))).toBe('hello')
  })
})

describe('a change that the editor should not have accepted', () => {
  // Tiptap's commands and a dialog that was open do not stop for `setEditable(false)`: the change gets into the document, and
  // what the session says must still be true about it.

  it('is not called synced when the person tries again after a stopped error, while the server holds the writes', async () => {
    world = createWorld()
    const opening = await opened()
    await typeAndStore(opening, 'hello')
    world.server.closeConnections(4401, 'unauthenticated')
    await advance(50)
    expect(opening.session.getSnapshot()).toMatchObject({ state: 'error', editable: false })

    typeInto(opening.doc, ' X', 5)
    world.server.holdStores()
    const before = opening.states.length
    opening.session.retry()
    await advance(STORED_ACK_TIMEOUT_MS + 1000)

    expect(opening.states.slice(before)).not.toContain('synced')
    expect(opening.session.getSnapshot()).toMatchObject({ state: 'error', cause: 'store-timeout' })
    expect(textOf(world.server.document(wireName))).toBe('hello X')
    world.server.releaseStores()
    await advance(2000)
    expect(opening.session.getSnapshot().state).toBe('synced')
  })

  it('is not called synced when the role comes back after a change made while read-only, while the server holds the writes', async () => {
    world = createWorld()
    const opening = await opened()
    await typeAndStore(opening, 'hello')
    world.setAccess(editor, { scope: 'readonly' })
    world.server.closeConnections(4409, 'role-changed')
    await advance(1100)
    expect(opening.session.getSnapshot()).toMatchObject({ state: 'read-only', editable: false })

    typeInto(opening.doc, ' Y', 5)
    world.setAccess(editor, { scope: 'read-write' })
    world.server.holdStores()
    const before = opening.states.length
    world.server.closeConnections(4409, 'role-changed')
    await advance(STORED_ACK_TIMEOUT_MS + 3000)

    expect(opening.states.slice(before)).not.toContain('synced')
    expect(opening.session.getSnapshot()).toMatchObject({ state: 'error', cause: 'store-timeout' })
    world.server.releaseStores()
    await advance(2000)
    expect(opening.session.getSnapshot().state).toBe('synced')
    expect(textOf(world.server.document(wireName))).toBe('hello Y')
  })
})

describe('when the server ends the connection', () => {
  it('calls disconnect and then connect after an in-band close, and comes back', async () => {
    world = createWorld()
    const opening = await opened()
    const socket = socketOf(opening)
    const disconnect = vi.spyOn(socket, 'disconnect')
    const connect = vi.spyOn(socket, 'connect')

    world.server.endInBand('closed')
    await advance(10)

    expect(state(opening)).toBe('reconnecting')
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(connect).not.toHaveBeenCalled()
    await advance(1000)
    expect(connect).toHaveBeenCalledTimes(1)
    expect(disconnect.mock.invocationCallOrder[0]).toBeLessThan(connect.mock.invocationCallOrder[0] ?? 0)
    await advance(50)
    expect(state(opening)).toBe('synced')
  })

  it('waits 1, 2, 4, … 30 s between repeated rate-limit closes, and starts again after a minute of a good connection', async () => {
    world = createWorld()
    const opening = await opened()
    const connected = () => world.server.connectionsTo(wireName)

    for (const delay of [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]) {
      world.server.closeConnections(4429, 'rate-limited')
      await advance(delay - 10)
      expect(connected()).toBe(0)
      await advance(60)
      expect(connected()).toBe(1)
    }

    await advance(RECONNECT_STABLE_MS)
    world.server.closeConnections(4429, 'rate-limited')
    await advance(990)
    expect(connected()).toBe(0)
    await advance(60)
    expect(connected()).toBe(1)
    expect(state(opening)).toBe('synced')
  })

  it('comes back at once after a role change on a connection that was stable', async () => {
    world = createWorld()
    await opened()
    await advance(RECONNECT_STABLE_MS)

    world.server.closeConnections(4409, 'role-changed')
    await advance(50)

    expect(world.server.connectionsTo(wireName)).toBe(1)
  })

  it('treats access removed as final: revoked, no more connecting, nothing sent afterwards', async () => {
    world = createWorld()
    const opening = await opened()
    world.setAccess(editor, { denied: 'not-found' })

    world.server.closeConnections(4403, 'access-revoked')
    typeInto(opening.doc, 'typed after it')
    await advance(RECONNECT_STABLE_MS)

    expect(state(opening)).toBe('revoked')
    expect(world.server.connectionsTo(wireName)).toBe(0)
    expect(textOf(world.server.document(wireName))).toBe('')
  })

  it('asks the person to sign in again after the session ended (4401)', async () => {
    world = createWorld()
    const opening = await opened()

    world.server.closeConnections(4401, 'unauthenticated')
    await advance(RECONNECT_STABLE_MS)

    expect(opening.session.getSnapshot()).toMatchObject({ state: 'error', cause: 'unauthenticated', action: 'retry' })
    expect(world.server.connectionsTo(wireName)).toBe(0)
  })

  it.each([
    { code: 4413, reason: 'document-too-large' },
    { code: 1009, reason: 'message-too-big' },
  ])(
    'offers to discard the local changes and reload after $code, never a retry, and does not reconnect',
    async ({ code, reason }) => {
      world = createWorld()
      const opening = await opened()

      world.server.closeConnections(code, reason)
      await advance(RECONNECT_STABLE_MS)

      expect(opening.session.getSnapshot()).toMatchObject({
        state: 'error',
        cause: 'document-too-large',
        action: 'discard-and-reload',
        editable: false,
      })
      expect(world.server.connectionsTo(wireName)).toBe(0)
    },
  )

  it('drops what was not stored and opens the document again from the server when the person discards and reloads', async () => {
    world = createWorld()
    const opening = await opened()
    await typeAndStore(opening, 'stored text')
    world.server.closeConnections(4413, 'document-too-large')
    await advance(50)
    typeInto(opening.doc, 'never sent ', 0)
    const generation = opening.session.getSnapshot().generation

    opening.session.discardAndReload()
    await advance(1100)

    const reopened = opening.session.getSnapshot()
    expect(reopened.generation).toBe(generation + 1)
    expect(textOf(reopened.ydoc)).toBe('stored text')
    expect(reopened.state).toBe('synced')
    // One new connection, not one that is closed while it is still opening.
    expect(world.server.abortedConnections).toBe(0)
  })

  it('stores what the person writes after discarding, and what was discarded does not stand in the way', async () => {
    world = createWorld()
    const opening = await opened()
    await typeAndStore(opening, 'stored text')
    // Written offline and too large to send: the server refuses the message and none of it ever reaches it.
    world.network.set(false)
    await advance(50)
    typeInto(opening.doc, 'z'.repeat(MAX_MESSAGE_BYTES + 1000), 0)
    world.network.set(true)
    await advance(100)
    expect(opening.session.getSnapshot()).toMatchObject({ state: 'error', cause: 'document-too-large' })

    opening.session.discardAndReload()
    await advance(50)
    typeInto(opening.session.getSnapshot().ydoc, ' and then more')
    await advance(1100)

    expect(opening.session.getSnapshot().state).toBe('synced')
    expect(textOf(world.server.document(wireName))).toBe(' and then morestored text')
  })

  it('does nothing when asked to discard and reload from an error that is not about size', async () => {
    world = createWorld()
    const opening = await opened(stranger)
    const generation = opening.session.getSnapshot().generation

    opening.session.discardAndReload()

    expect(opening.session.getSnapshot().generation).toBe(generation)
  })
})

describe('while the browser is offline', () => {
  it('keeps what the person writes, says it is only on this device, and stores it after the connection returns', async () => {
    world = createWorld()
    const opening = await opened()

    world.network.set(false)
    typeInto(opening.doc, 'written offline')
    await advance(100)
    expect(state(opening)).toBe('offline-local')
    expect(opening.session.getSnapshot().editable).toBe(true)
    expect(world.server.connectionsTo(wireName)).toBe(0)

    world.network.set(true)
    expect(state(opening)).toBe('reconnecting')
    await advance(100)
    // The server has it, and has not stored it yet: not synced.
    expect(state(opening)).toBe('synchronising')
    await advance(1100)
    expect(state(opening)).toBe('synced')
    expect(textOf(world.server.document(wireName))).toBe('written offline')
  })

  it('completes a reconnection after 2 000 offline edits against a server that takes 300 ms to load', async () => {
    world = createWorld({ loadDelayMs: 300 })
    const opening = await opened()
    await advance(300)
    world.network.set(false)
    await advance(50)

    for (let edit = 0; edit < 2000; edit += 1) typeInto(opening.doc, 'x')
    world.network.set(true)
    await advance(100)
    // The person keeps typing while the server loads the document.
    for (let edit = 0; edit < 100; edit += 1) typeInto(opening.doc, 'y')
    await advance(300 + 1100)

    expect(world.server.closes).toEqual([])
    expect(state(opening)).toBe('synced')
    expect(textOf(world.server.document(wireName))).toBe(textOf(opening.doc))
    expect(textOf(opening.doc)).toHaveLength(2100)
  })

  it('opens as read-only and drops what was written offline when the role became reader meanwhile, and says so', async () => {
    world = createWorld()
    const opening = await opened()
    await typeAndStore(opening, 'stored text')
    world.network.set(false)
    typeInto(opening.doc, 'offline ', 0)
    world.setAccess(editor, { scope: 'readonly' })
    const generation = opening.session.getSnapshot().generation

    world.network.set(true)
    await advance(100)

    const after = opening.session.getSnapshot()
    expect(after).toMatchObject({ state: 'read-only', editable: false, notice: 'offline-changes-discarded' })
    expect(after.generation).toBe(generation + 1)
    expect(textOf(after.ydoc)).toBe('stored text')
    expect(textOf(world.server.document(wireName))).toBe('stored text')

    opening.session.dismissNotice()
    expect(opening.session.getSnapshot().notice).toBeNull()
  })
})

describe('what may be unsent', () => {
  it('stops accepting edits above the budget and accepts them again once the server stored them', async () => {
    world = createWorld()
    const opening = await opened()
    world.server.holdStores()

    typeInto(opening.doc, 'z'.repeat(MAX_UNSENT_BYTES + 1000))
    await advance(100)

    expect(opening.session.getSnapshot().editable).toBe(false)
    expect(opening.session.hasRoomFor(1)).toBe(false)
    world.server.releaseStores()
    await advance(1100)
    expect(opening.session.getSnapshot().editable).toBe(true)
    expect(opening.session.hasRoomFor(1000)).toBe(true)
  })

  it('says whether content fits by the bytes of the update, on top of what is unsent', async () => {
    world = createWorld()
    const opening = await opened()
    world.server.holdStores()
    typeInto(opening.doc, 'z'.repeat(MAX_UNSENT_BYTES - 2000))
    await advance(100)

    expect(opening.session.hasRoomFor(1000)).toBe(true)
    expect(opening.session.hasRoomFor(MAX_UNSENT_BYTES)).toBe(false)
  })

  it('ends in the error for a document that is too large when a message goes over the limit of the transport', async () => {
    world = createWorld()
    const opening = await opened()

    typeInto(opening.doc, 'z'.repeat(MAX_MESSAGE_BYTES + 1000))
    await advance(100)

    expect(opening.session.getSnapshot()).toMatchObject({ state: 'error', cause: 'document-too-large' })
    expect(world.server.closes.map(({ code }) => code)).toEqual([1009])
  })
})

describe('people in the document', () => {
  it('lists the others by the name the server knows, whatever the client wrote, and never the person themselves', async () => {
    world = createWorld()
    const first = await opened()
    const second = await opened(reader)

    first.session.getSnapshot().provider.setAwarenessField('user', {
      id: editor.userId,
      name: 'Someone Else',
      color: '#336699',
    })
    second.session.getSnapshot().provider.setAwarenessField('user', {
      id: reader.userId,
      name: 'Another Name',
      color: '#aa5500',
    })
    await advance(100)

    expect(second.session.getSnapshot().peers).toEqual([
      { userId: editor.userId, name: 'Elena Editor', color: '#336699' },
    ])
    expect(first.session.getSnapshot().peers).toEqual([
      { userId: reader.userId, name: 'Rafael Reader', color: '#aa5500' },
    ])
  })

  it('empties the list when the connection is lost', async () => {
    world = createWorld()
    const first = await opened()
    const second = await opened(reader)
    second.session.getSnapshot().provider.setAwarenessField('user', { id: reader.userId, name: 'x', color: '#aa5500' })
    await advance(100)
    expect(first.session.getSnapshot().peers).toHaveLength(1)

    world.server.closeConnections(4429, 'rate-limited')
    await advance(10)

    expect(first.session.getSnapshot().peers).toEqual([])
  })
})

describe('what other people changed', () => {
  const events: StatelessEvent[] = [
    { type: 'metadata-changed', title: 'New title', revision: 3 },
    { type: 'access-changed' },
    { type: 'comments-changed', threadId: '3f6b1c2a-0000-4000-8000-0000000000aa' },
    { type: 'versions-changed' },
    { type: 'document-archived' },
  ]

  it.each(events)('passes $type on to the screen', async (event) => {
    world = createWorld()
    const opening = await opened()
    const heard: StatelessEvent[] = []
    opening.session.onServerEvent((heardEvent) => heard.push(heardEvent))

    world.server.broadcast(wireName, event)
    await advance(10)

    expect(heard).toEqual([event])
  })

  it('keeps the events of the durability protocol to itself', async () => {
    world = createWorld()
    const opening = await opened()
    const heard: StatelessEvent[] = []
    opening.session.onServerEvent((event) => heard.push(event))

    typeInto(opening.doc, 'x')
    await advance(1100)
    world.server.broadcast(wireName, { type: 'document-too-large' })
    await advance(10)

    expect(heard).toEqual([])
    expect(state(opening)).toBe('error')
  })
})

describe('what a screen reads', () => {
  it('gives the same snapshot until something it shows changes, so typing does not render the screen', async () => {
    world = createWorld()
    const opening = await opened()
    await typeAndStore(opening, 'first')
    const before = opening.session.getSnapshot()
    const rendered = vi.fn()
    opening.session.subscribe(rendered)
    world.server.holdStores()

    typeInto(opening.doc, ' more', 5)
    await advance(100)
    const changed = rendered.mock.calls.length
    for (let key = 0; key < 20; key += 1) typeInto(opening.doc, 'k', 5)
    await advance(100)

    // The first change moved synced to synchronising; the twenty after it moved nothing a screen shows.
    expect(changed).toBe(1)
    expect(rendered).toHaveBeenCalledTimes(1)
    expect(opening.session.getSnapshot()).not.toBe(before)
  })
})
