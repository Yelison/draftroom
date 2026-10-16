import { STORED_ACK_TIMEOUT_MS } from '@draftroom/contract/collab'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SimulatedCollabServer } from '../../data/mock/collab/SimulatedCollabServer.ts'
import type { CollabSession, CollabSnapshot } from '../session.ts'
import { advance, textOf, typeInto } from './sessionWorld.ts'

/**
 * One battery of behaviour for any implementation of `CollabSession`: what the person is told in each state, and when.
 * Both implementations are the same session over the provider, one with the network made up for a test and one with the
 * mock's, so a mock that drifted from the states the protocol requires would fail the assertions the session does.
 *
 * What it does not prove is anything about the real server, which the end-to-end suite against it does (T2.4).
 */
export interface SessionContractWorld {
  /** The server the sessions talk to, which the tests make hold or fail its writes and end its connections. */
  readonly server: SimulatedCollabServer
  /** The name of the document on the wire. */
  readonly wireName: string
  /** Opens the document as someone who edits it, someone who only reads it, or someone with no access to it. */
  open(who: 'editor' | 'reader' | 'stranger'): CollabSession
  dispose(): void
}

export function describeSessionContract(name: string, createWorld: () => SessionContractWorld) {
  describe(`CollabSession contract: ${name}`, () => {
    let world: SessionContractWorld
    beforeEach(() => {
      vi.useFakeTimers()
      world = createWorld()
    })
    afterEach(() => {
      world.dispose()
      vi.useRealTimers()
    })

    /** Opens the document as `who` and lets the connection and the handshake finish; also records the states it went through. */
    async function opened(who: Parameters<SessionContractWorld['open']>[0]) {
      const session = world.open(who)
      const states: CollabSnapshot['state'][] = [session.getSnapshot().state]
      session.subscribe(() => {
        const { state } = session.getSnapshot()
        if (states.at(-1) !== state) states.push(state)
      })
      await advance(50)
      return { session, states }
    }
    const doc = (session: CollabSession) => session.getSnapshot().ydoc

    it('opens a document for an editor: loading, synchronising, then synced once the handshake is done', async () => {
      const { session, states } = await opened('editor')

      expect(states).toEqual(['connecting', 'synchronising', 'synced'])
      expect(session.getSnapshot()).toMatchObject({ editable: true, loaded: true, cause: null })
    })

    it('opens a document for a reader as read-only, never unsynced, and applies nothing it writes', async () => {
      const { session, states } = await opened('reader')

      // The server answers a reader's update "not applied": the provider's counter never comes back to zero.
      session.getSnapshot().provider.incrementUnsyncedChanges()
      typeInto(doc(session), 'forged')
      await advance(2000)

      expect(states).toEqual(['connecting', 'read-only'])
      expect(session.getSnapshot().editable).toBe(false)
      expect(textOf(world.server.document(world.wireName))).toBe('')
    })

    it('sends nothing of what a reader changes: the server is not even asked, only the connection says it is read-only', async () => {
      const { session } = await opened('reader')

      typeInto(doc(session), 'a change the editor should not have accepted')
      typeInto(doc(session), ' and another', 0)
      await advance(3000)

      expect(world.server.updatesFromReaders).toBe(0)
      expect(session.getSnapshot().state).toBe('read-only')
    })

    it('stops with an error that can be tried again, and stops connecting, for a person who cannot open the document', async () => {
      const { session } = await opened('stranger')

      expect(session.getSnapshot()).toMatchObject({
        state: 'error',
        cause: 'not-found',
        action: 'retry',
        editable: false,
      })
      expect(session.getSnapshot().provider.configuration.websocketProvider.shouldConnect).toBe(false)
    })

    it('says synchronising while the server has the change and has not stored it, and synced once it did', async () => {
      const { session } = await opened('editor')
      world.server.holdStores()

      typeInto(doc(session), 'hello')
      await advance(3000)
      expect(session.getSnapshot().state).toBe('synchronising')

      world.server.releaseStores()
      await advance(1100)
      expect(session.getSnapshot().state).toBe('synced')
    })

    it('shows an error, with the editor still editable, when the write fails, and recovers when the server stores', async () => {
      const { session } = await opened('editor')
      world.server.failStores(true)

      typeInto(doc(session), 'hello')
      await advance(STORED_ACK_TIMEOUT_MS + 100)

      expect(session.getSnapshot()).toMatchObject({ state: 'error', cause: 'store-timeout', editable: true })
      world.server.failStores(false)
      await advance(2100)
      expect(session.getSnapshot().state).toBe('synced')
    })

    it('ends access removed as final: revoked, not editable, no more connecting', async () => {
      const { session } = await opened('editor')

      world.server.closeConnections(4403, 'access-revoked')
      await advance(60_000)

      expect(session.getSnapshot()).toMatchObject({ state: 'revoked', editable: false })
      expect(world.server.connectionsTo(world.wireName)).toBe(0)
    })

    it('offers to discard the local changes and reload, never a retry, when the document is too large', async () => {
      const { session } = await opened('editor')

      world.server.closeConnections(4413, 'document-too-large')
      await advance(60_000)

      expect(session.getSnapshot()).toMatchObject({
        state: 'error',
        cause: 'document-too-large',
        action: 'discard-and-reload',
        editable: false,
      })
      expect(world.server.connectionsTo(world.wireName)).toBe(0)
    })
  })
}
