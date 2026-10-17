import * as Y from 'yjs'
import { isRecord } from '../../../collab/awareness.ts'
import type { AwarenessChange, RoomObserver, SimulatedCollabServer } from './SimulatedCollabServer.ts'

/**
 * What lets the tabs of one browser share the documents of the demo. Every tab runs a world of its own, and this carries
 * the changes of the Yjs documents and the awareness of the people in them from one world to the others, so that tabs
 * which are in the same world see one document. Nothing else is shared: the lists, the comments and the rest of the
 * contract are each tab's own, as the demo starts again on every reload.
 *
 * A tab that opens joins the oldest world there is; a tab that is reloaded starts a world of its own, and the others
 * keep the one they had. Messages carry the world they belong to and a tab ignores those of another, so a world that
 * was left behind shares nothing with the one that replaced it.
 */

/** Where messages go and come from. In a browser it is a `BroadcastChannel`; a test gives it a bus of its own. */
export interface TabTransport {
  post(message: TabMessage): void
  /** Calls `listener` with every message the other tabs post; returns what stops it. */
  listen(listener: (message: TabMessage) => void): () => void
}

export type TabMessage =
  /** A tab that is opening asks who is there. */
  | { readonly kind: 'hello'; readonly peer: string }
  /** The answer: the world the tab is in, and when that world started. */
  | { readonly kind: 'welcome'; readonly peer: string; readonly world: string; readonly startedAt: number }
  /** A tab opened a document and asks for what the others have of it. */
  | {
      readonly kind: 'open'
      readonly world: string
      readonly peer: string
      readonly document: string
      readonly stateVector: Uint8Array
    }
  | {
      readonly kind: 'update'
      readonly world: string
      readonly peer: string
      readonly document: string
      readonly update: Uint8Array
    }
  | {
      readonly kind: 'awareness'
      readonly world: string
      readonly peer: string
      readonly document: string
      readonly changes: readonly AwarenessChange[]
    }
  /** A tab went away: its people are no longer in any document. */
  | { readonly kind: 'bye'; readonly world: string; readonly peer: string }

const channelName = 'draftroom-demo'

/** The channel of the browser, or `undefined` where there is none: the demo then works in a single tab. */
export function browserTransport(): TabTransport | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined
  const channel = new BroadcastChannel(channelName)
  return {
    post: (message) => channel.postMessage(message),
    listen(listener) {
      const onMessage = (event: MessageEvent<unknown>) => {
        const message = readMessage(event.data)
        if (message !== null) listener(message)
      }
      channel.addEventListener('message', onMessage)
      return () => channel.removeEventListener('message', onMessage)
    },
  }
}

const isText = (value: unknown): value is string => typeof value === 'string'

/** What a message of another tab holds, or `null`: anything else on the channel is not for the demo. */
export function readMessage(data: unknown): TabMessage | null {
  if (!isRecord(data) || !isText(data['peer'])) return null
  const { kind, peer } = data
  const world = data['world']
  const document = data['document']
  switch (kind) {
    case 'hello':
      return { kind, peer }
    case 'welcome': {
      const startedAt = data['startedAt']
      return isText(world) && typeof startedAt === 'number' ? { kind, peer, world, startedAt } : null
    }
    case 'bye':
      return isText(world) ? { kind, peer, world } : null
    case 'open': {
      const stateVector = data['stateVector']
      return isText(world) && isText(document) && stateVector instanceof Uint8Array
        ? { kind, peer, world, document, stateVector }
        : null
    }
    case 'update': {
      const update = data['update']
      return isText(world) && isText(document) && update instanceof Uint8Array
        ? { kind, peer, world, document, update }
        : null
    }
    case 'awareness': {
      const changes = data['changes']
      return isText(world) && isText(document) && Array.isArray(changes)
        ? { kind, peer, world, document, changes: changes.filter(isChange) }
        : null
    }
    default:
      return null
  }
}

const isChange = (value: unknown): value is AwarenessChange =>
  isRecord(value) && typeof value['clientId'] === 'number' && typeof value['clock'] === 'number' && 'state' in value

export interface JoinOptions {
  /** Tells this tab from the others on the channel. */
  peer: string
  now(): number
  /** How long to wait for the answers of the tabs that are open. */
  discoveryMs: number
  /** Start a world of one's own instead of joining one: what a reloaded tab does. */
  fresh: boolean
}

export interface TabLink {
  /** The world this tab is in: the peer that started it. */
  readonly world: string
  /**
   * Whether this tab may write a document's starting content when it opens one. Two tabs that each wrote it would
   * leave every paragraph twice once they met, so only the tab that started the world does, and the others receive it;
   * when that tab has gone, whichever tab opens a document first writes it.
   */
  mayStartContent(): boolean
  close(): void
}

/** Joins the oldest world the other tabs are in, or starts one, and keeps `server` and theirs on the same documents. */
export async function joinTabs(
  server: SimulatedCollabServer,
  transport: TabTransport,
  { peer, now, discoveryMs, fresh }: JoinOptions,
): Promise<TabLink> {
  const world = fresh ? { id: peer, startedAt: now() } : await discoverWorld(transport, peer, now, discoveryMs)
  const startedTheWorld = world.id === peer
  let founderGone = false
  const post = (message: TabMessage) => transport.post(message)

  const observer: RoomObserver = {
    created: (document) =>
      post({
        kind: 'open',
        world: world.id,
        peer,
        document,
        stateVector: Y.encodeStateVector(server.document(document)),
      }),
    updated: (document, update) => post({ kind: 'update', world: world.id, peer, document, update }),
    awareness: (document, changes) => post({ kind: 'awareness', world: world.id, peer, document, changes }),
  }
  const stopObserving = server.observe(observer)

  const stopListening = transport.listen((message) => {
    if (message.peer === peer) return
    if (message.kind === 'hello') {
      post({ kind: 'welcome', peer, world: world.id, startedAt: world.startedAt })
      return
    }
    if (message.kind === 'welcome' || message.world !== world.id) return
    switch (message.kind) {
      case 'open':
        // The tab that started the world is who writes the starting content, so it opens the document to answer.
        if (startedTheWorld || server.hasDocument(message.document)) {
          const room = server.document(message.document)
          post({
            kind: 'update',
            world: world.id,
            peer,
            document: message.document,
            update: Y.encodeStateAsUpdate(room, message.stateVector),
          })
          post({
            kind: 'awareness',
            world: world.id,
            peer,
            document: message.document,
            changes: server.awarenessOf(message.document),
          })
        }
        break
      case 'update':
        // A document nobody opened here is asked for when it is opened, and not before.
        if (server.hasDocument(message.document)) server.receiveUpdate(message.document, message.update)
        break
      case 'awareness':
        server.receiveAwareness(message.document, message.peer, message.changes)
        break
      case 'bye':
        server.dropPeer(message.peer)
        if (message.peer === world.id) founderGone = true
        break
    }
  })

  return {
    world: world.id,
    mayStartContent: () => startedTheWorld || founderGone,
    close() {
      stopListening()
      stopObserving()
      post({ kind: 'bye', world: world.id, peer })
    },
  }
}

/** Asks the open tabs which world they are in and takes the oldest; the tab starts its own when nobody answers. */
function discoverWorld(
  transport: TabTransport,
  peer: string,
  now: () => number,
  discoveryMs: number,
): Promise<{ id: string; startedAt: number }> {
  return new Promise((resolve) => {
    const worlds: { id: string; startedAt: number }[] = []
    const stop = transport.listen((message) => {
      if (message.kind === 'welcome') worlds.push({ id: message.world, startedAt: message.startedAt })
    })
    transport.post({ kind: 'hello', peer })
    setTimeout(() => {
      stop()
      const oldest = worlds.sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))[0]
      resolve(oldest ?? { id: peer, startedAt: now() })
    }, discoveryMs)
  })
}
