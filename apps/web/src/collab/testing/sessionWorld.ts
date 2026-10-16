import { documentName } from '@draftroom/contract/collab'
import { vi } from 'vitest'
import * as Y from 'yjs'
import {
  SimulatedCollabServer,
  type Access,
  type Identity,
  type SimulatedServerOptions,
} from '../../data/mock/collab/SimulatedCollabServer.ts'
import { createCollabSession, type CollabSession, type CollabSnapshot } from '../session.ts'
import type { Network } from '../network.ts'

export const documentId = '3f6b1c2a-0000-4000-8000-000000000001'
export const wireName = documentName(documentId)

export const editor: Identity = { userId: 'user-editor', displayName: 'Elena Editor' }
export const reader: Identity = { userId: 'user-reader', displayName: 'Rafael Reader' }
export const stranger: Identity = { userId: 'user-stranger', displayName: 'Sara Stranger' }

const readWrite: Access = { scope: 'read-write' }
const readOnly: Access = { scope: 'readonly' }
const notFound: Access = { denied: 'not-found' }

/** A browser whose network a test takes away and gives back. */
export function fakeNetwork(): Network & { set(online: boolean): void } {
  let online = true
  const listeners = new Set<(online: boolean) => void>()
  return {
    online: () => online,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(next) {
      online = next
      for (const listener of listeners) listener(next)
    },
  }
}

/** Lets the microtasks and the timers that are due run: what a test awaits between a cause and what it checks. */
export async function advance(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

export interface World {
  readonly server: SimulatedCollabServer
  readonly network: ReturnType<typeof fakeNetwork>
  /** Changes what a person is on the document from the next connection on: a role that changed, or access that was lost. */
  setAccess(identity: Identity, access: Access): void
  /** Ends every session that was opened. */
  dispose(): void
  /** Opens the document as `who`, with the back-off drawn at its ceiling so a delay is exact. */
  open(who?: Identity | null): Opened
}

export interface Opened {
  readonly session: CollabSession
  /** The Yjs document the session holds now (it is made again when changes are discarded). */
  readonly doc: Y.Doc
  /** The states the session went through, in order, without repeats. */
  readonly states: CollabSnapshot['state'][]
}

/** A simulated server with the people above, and the sessions that open the document against it. Needs fake timers. */
export function createWorld(options: Partial<SimulatedServerOptions> = {}): World {
  const accessOf = new Map<Identity, Access>([
    [editor, readWrite],
    [reader, readOnly],
  ])
  const server = new SimulatedCollabServer({
    authorize: (_name, identity) => (identity === null ? notFound : (accessOf.get(identity) ?? notFound)),
    ...options,
  })
  const network = fakeNetwork()
  const sessions: CollabSession[] = []
  return {
    server,
    network,
    setAccess: (identity, access) => accessOf.set(identity, access),
    dispose() {
      for (const session of sessions.splice(0)) session.destroy()
    },
    open(who = editor) {
      const session = createCollabSession({
        documentId,
        url: 'ws://simulated.test',
        webSocket: server.socketFor(who),
        network,
        random: () => 1,
      })
      sessions.push(session)
      const states: CollabSnapshot['state'][] = [session.getSnapshot().state]
      session.subscribe(() => {
        const { state } = session.getSnapshot()
        if (states.at(-1) !== state) states.push(state)
      })
      return {
        session,
        states,
        get doc() {
          return session.getSnapshot().ydoc
        },
      }
    },
  }
}

/** The text a test types: the content of the root text `t`, which stands for the shared document. */
export const typeInto = (doc: Y.Doc, text: string, at = 0): void => {
  doc.getText('t').insert(at, text)
}

export const textOf = (doc: Y.Doc): string => doc.getText('t').toString()
