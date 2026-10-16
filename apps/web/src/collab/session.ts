import {
  MAX_UNSENT_BYTES,
  STORED_ACK_TIMEOUT_MS,
  documentName,
  parseStatelessEvent,
  type AuthorizedScope,
  type StatelessEvent,
  type SyncState,
} from '@draftroom/contract/collab'
import { HocuspocusProvider, HocuspocusProviderWebsocket, WebSocketStatus } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { peersOf, type Peer } from './awareness.ts'
import { fromBase64 } from './base64.ts'
import { browserNetwork, type Network } from './network.ts'
import { PendingChanges } from './PendingChanges.ts'
import { createReconnectBackoff, reconnectsOnItsOwn, type ReconnectBackoff } from './reconnection.ts'
import {
  createSyncModel,
  errorAction,
  isEditable,
  transition,
  type SyncDenial,
  type SyncEffect,
  type SyncFault,
  type SyncInput,
  type SyncModel,
} from './syncState.ts'

/** Said to the person once, after something they did while they were away could not be kept. */
export type SessionNotice = 'offline-changes-discarded'

/** Everything a screen reads of a session. It is a new object only when one of these values changed. */
export interface CollabSnapshot {
  readonly state: SyncState
  /** Why the state is `error`; `null` in every other state. */
  readonly cause: SyncFault | null
  /** What `error` offers: a retry, or discarding the local changes and reloading (a retry would send the same message). */
  readonly action: 'retry' | 'discard-and-reload' | null
  /** Whether the editor accepts edits: the state allows it and what is unsent is within its budget. */
  readonly editable: boolean
  /** True once the document has been opened in this session, so a retry does not take the editor away. */
  readonly loaded: boolean
  readonly peers: readonly Peer[]
  readonly notice: SessionNotice | null
  /** Changes when the document and the provider are made again, which is when an editor bound to them must be too. */
  readonly generation: number
  readonly ydoc: Y.Doc
  readonly provider: HocuspocusProvider
}

/** A live connection to one document: its content, who else is in it, and whether what the person wrote is stored. */
export interface CollabSession {
  /** For `useSyncExternalStore`: the same object until something a screen shows changes. */
  getSnapshot(): CollabSnapshot
  subscribe(listener: () => void): () => void
  /** The events other people's changes arrive as, for the screen to refresh what they changed (protocol section 9). */
  onServerEvent(listener: (event: StatelessEvent) => void): () => void
  /** Tries again from `error`; what is pending is kept. */
  retry(): void
  /** The way out of a document that is too large: drops what was not stored, and opens the document again. */
  discardAndReload(): void
  dismissNotice(): void
  /** Whether content that would add `bytes` to the Yjs update still fits what may be unsent (protocol section 12.5). */
  hasRoomFor(bytes: number): boolean
  destroy(): void
}

export interface CollabSessionOptions {
  documentId: string
  /** Where the collaboration server listens. */
  url: string
  /** Replaces the browser's WebSocket; the simulated server hands one out. */
  webSocket?: new (url: string) => unknown
  network?: Network
  now?: () => number
  random?: () => number
}

/** One connection: a Yjs document, the provider that carries it and the socket the provider owns. */
interface Link {
  readonly ydoc: Y.Doc
  readonly provider: HocuspocusProvider
  readonly socket: HocuspocusProviderWebsocket
  /** Whether the provider sees the document's updates: closed while there is no handshake (section 12.3). */
  gateOpen: boolean
}

const scopeOf = (scope: string): AuthorizedScope => (scope === 'read-write' ? 'read-write' : 'readonly')

const denialOf = (reason: string): SyncDenial =>
  reason === 'unauthenticated' || reason === 'not-found' ? reason : 'unavailable'

const sameSnapshot = (a: CollabSnapshot, b: CollabSnapshot): boolean =>
  a.state === b.state &&
  a.cause === b.cause &&
  a.action === b.action &&
  a.editable === b.editable &&
  a.loaded === b.loaded &&
  a.notice === b.notice &&
  a.generation === b.generation &&
  a.peers.length === b.peers.length &&
  a.peers.every((peer, index) => peer.userId === b.peers[index]?.userId && peer.name === b.peers[index]?.name)

export function createCollabSession(options: CollabSessionOptions): CollabSession {
  return new ProviderSession(options)
}

class ProviderSession implements CollabSession {
  private model: SyncModel
  private readonly pending = new PendingChanges()
  private lastStored: Y.Snapshot | null = null
  private overBudget = false
  private loaded = false
  private notice: SessionNotice | null = null
  private peers: Peer[] = []
  private generation = 0
  private link: Link | null = null
  private ackTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  /** The socket was asked to close and the session wants to connect as soon as it has: the provider ignores `connect()` before. */
  private connectOnClose = false
  private readonly backoff: ReconnectBackoff
  private readonly network: Network
  private readonly stopListeningToNetwork: () => void
  private readonly listeners = new Set<() => void>()
  private readonly eventListeners = new Set<(event: StatelessEvent) => void>()
  private readonly queue: SyncInput[] = []
  private dispatching = false
  private current: CollabSnapshot

  constructor(private readonly options: CollabSessionOptions) {
    this.network = options.network ?? browserNetwork
    this.model = createSyncModel({ online: this.network.online(), hasLocalCopy: false })
    this.backoff = createReconnectBackoff({ now: options.now ?? Date.now, random: options.random ?? Math.random })
    this.start()
    this.current = this.build()
    this.dispatch({ type: 'open' })
    this.stopListeningToNetwork = this.network.subscribe((online) => this.dispatch({ type: 'network-changed', online }))
  }

  getSnapshot = (): CollabSnapshot => this.current

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onServerEvent(listener: (event: StatelessEvent) => void): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  retry(): void {
    this.dispatch({ type: 'open' })
  }

  discardAndReload(): void {
    if (this.model.state !== 'error' || this.model.cause !== 'document-too-large') return
    this.discardLocalState()
    this.dispatch({ type: 'open' })
  }

  dismissNotice(): void {
    this.notice = null
    this.publish()
  }

  hasRoomFor(bytes: number): boolean {
    return this.unsentBytes() + bytes <= MAX_UNSENT_BYTES
  }

  destroy(): void {
    this.stopListeningToNetwork()
    this.teardown()
    this.listeners.clear()
    this.eventListeners.clear()
  }

  // --- The machine and its effects ----------------------------------------------------------------------------------

  private dispatch(event: SyncInput): void {
    this.queue.push(event)
    // An effect can cause an event of its own; it waits its turn so the machine never runs inside itself.
    if (this.dispatching) return
    this.dispatching = true
    try {
      for (let next = this.queue.shift(); next !== undefined; next = this.queue.shift()) {
        const step = transition(this.model, next)
        this.model = step.model
        if (this.model.hasBeenAuthorized) this.loaded = true
        for (const effect of step.effects) this.run(effect)
      }
    } finally {
      this.dispatching = false
    }
    this.publish()
  }

  private run(effect: SyncEffect): void {
    switch (effect.type) {
      case 'start-ack-timer':
        this.stopAckTimer()
        this.ackTimer = setTimeout(() => this.dispatch({ type: 'stored-ack-timeout' }), STORED_ACK_TIMEOUT_MS)
        break
      case 'stop-ack-timer':
        this.stopAckTimer()
        break
      case 'disconnect':
        this.stopReconnecting()
        this.connectOnClose = false
        this.closeGate()
        this.link?.socket.disconnect()
        break
      case 'connect':
        this.stopReconnecting()
        this.connectWhenClosed()
        break
      case 'reopen':
        this.reopen()
        break
      case 'purge-local-copy':
        // There is no copy outside this page yet: what is pending leaves with the session. Nothing is uploaded after it.
        this.pending.clear()
        break
      case 'discard-offline-changes':
        this.discardLocalState()
        this.notice = 'offline-changes-discarded'
        break
    }
  }

  /** `disconnect()` and then `connect()`, also when the socket is open, so authentication and the handshake run again. */
  private reopen(): void {
    if (this.link === null) {
      this.start()
      return
    }
    this.stopReconnecting()
    this.closeGate()
    const { socket, provider } = this.link
    socket.disconnect()
    // The provider is told the connection is over now, not when the socket reports its close: without it its `synced`
    // stays true and the handshake of the new connection would never announce itself.
    provider.onClose()
    this.connectWhenClosed()
  }

  /**
   * `connect()` does nothing while the provider still takes the socket for open, and it does until the close it was asked
   * for has been reported, which is later than `disconnect()` returns. So the connection waits for that report.
   */
  private connectWhenClosed(): void {
    const socket = this.link?.socket
    if (socket === undefined) return
    if (socket.status === WebSocketStatus.Connected) this.connectOnClose = true
    else void socket.connect()
  }

  // --- The connection -----------------------------------------------------------------------------------------------

  private start(): void {
    const ydoc = new Y.Doc()
    const socket = new HocuspocusProviderWebsocket({
      url: this.options.url,
      autoConnect: false,
      ...(this.options.webSocket === undefined ? {} : { WebSocketPolyfill: this.options.webSocket }),
    })
    const provider = new HocuspocusProvider({
      name: documentName(this.options.documentId),
      document: ydoc,
      // The identity is the session cookie, never a token (protocol section 3.3).
      token: null,
      sessionAwareness: false,
      websocketProvider: socket,
    })
    provider.attach()
    const link: Link = { ydoc, provider, socket, gateOpen: true }
    this.link = link
    this.generation += 1
    this.closeGate()
    ydoc.on('update', this.onDocumentUpdate)
    this.listenTo(link)
    void socket.connect()
  }

  private listenTo({ provider, socket }: Link): void {
    provider.on('authenticated', ({ scope }: { scope: string }) => {
      this.backoff.connected()
      this.dispatch({ type: 'authenticated', scope: scopeOf(scope) })
    })
    provider.on('authenticationFailed', ({ reason }: { reason: string }) =>
      this.dispatch({ type: 'authentication-denied', reason: denialOf(reason) }),
    )
    provider.on('synced', () => {
      // Only now may the provider send what the person types: until the server has loaded the document it holds
      // everything in a small buffer, and a reconnection's handshake sends all of it anyway.
      if (provider.authorizedScope === 'read-write') this.openGate()
      this.dispatch({ type: 'handshake-completed' })
    })
    provider.on('unsyncedChanges', ({ number }: { number: number }) =>
      this.dispatch({ type: 'unsynced-changes-changed', count: number }),
    )
    provider.on('stateless', ({ payload }: { payload: string }) => this.onStateless(payload))
    provider.on('awarenessChange', () => this.updatePeers())
    provider.on('close', ({ event }: { event: { code?: number } }) => {
      // The provider reports an in-band close as a close of code 1000 and leaves the socket open.
      const inBand = socket.status === WebSocketStatus.Connected
      this.onClose(event.code ?? null, inBand)
    })
  }

  private onClose(code: number | null, inBand: boolean): void {
    this.closeGate()
    if (this.connectOnClose && this.link?.socket.status !== WebSocketStatus.Connected) {
      this.connectOnClose = false
      void this.link?.socket.connect()
    }
    // The echo of a socket this session closed itself, while it waits to connect again, says nothing new.
    if (this.reconnectTimer !== null) return
    this.dispatch({ type: 'connection-closed', code, online: this.network.online() })
    const waiting = this.model.state === 'reconnecting' || this.model.state === 'connecting'
    if (waiting && reconnectsOnItsOwn({ code, inBand })) this.reconnectAfter(code)
  }

  /** The provider would retry after one fixed second; the client's own schedule is what spares a server that is refusing it. */
  private reconnectAfter(code: number | null): void {
    const socket = this.link?.socket
    if (socket === undefined) return
    socket.disconnect()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connectWhenClosed()
    }, this.backoff.delayAfter({ code }))
  }

  private stopReconnecting(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.connectOnClose = false
  }

  private stopAckTimer(): void {
    if (this.ackTimer !== null) clearTimeout(this.ackTimer)
    this.ackTimer = null
  }

  /** The provider stops hearing the document: nothing queues in it while there is no connection (protocol section 12.3). */
  private closeGate(): void {
    const link = this.link
    if (link === null || !link.gateOpen) return
    link.ydoc.off('update', link.provider.boundDocumentUpdateHandler)
    link.gateOpen = false
  }

  private openGate(): void {
    const link = this.link
    if (link === null || link.gateOpen) return
    link.ydoc.on('update', link.provider.boundDocumentUpdateHandler)
    link.gateOpen = true
  }

  private teardown(): void {
    this.stopReconnecting()
    this.stopAckTimer()
    const link = this.link
    if (link === null) return
    this.link = null
    link.ydoc.off('update', this.onDocumentUpdate)
    link.provider.destroy()
    link.socket.destroy()
    link.ydoc.destroy()
  }

  /** What is not stored is dropped and the document made again; the next connection loads the server's state. */
  private discardLocalState(): void {
    this.teardown()
    this.pending.clear()
    this.lastStored = null
    this.overBudget = false
    this.peers = []
    this.start()
  }

  // --- What the document and the server tell ------------------------------------------------------------------------

  private readonly onDocumentUpdate = (update: Uint8Array, origin: unknown): void => {
    // What the provider applied is the server's, not the person's.
    if (origin === this.link?.provider) return
    this.dispatch({ type: 'local-change' })
    if (this.model.hasPending) this.pending.add(update)
    this.measureUnsent()
  }

  private onStateless(payload: string): void {
    const event = parseStatelessEvent(payload)
    if (event === null) return
    if (event.type === 'stored') this.onStored(event.snapshot)
    else if (event.type === 'document-too-large') this.dispatch({ type: 'document-too-large' })
    else for (const listener of this.eventListeners) listener(event)
  }

  /** The rule of protocol section 7.4: what is pending is stored once the snapshot contains it, struct by struct and deletion by deletion. */
  private onStored(encoded: string): void {
    const bytes = fromBase64(encoded)
    if (bytes === null) return
    let snapshot: Y.Snapshot
    try {
      snapshot = Y.decodeSnapshot(bytes)
    } catch {
      // An event that cannot be read proves nothing: the wait for a covering one runs out and says so.
      return
    }
    this.lastStored = snapshot
    const coversLocalChanges = this.pending.isContainedIn(snapshot)
    if (coversLocalChanges) this.pending.clear()
    this.dispatch({ type: 'stored', coversLocalChanges })
    this.measureUnsent()
  }

  private updatePeers(): void {
    const link = this.link
    const states = link?.provider.awareness?.getStates()
    if (link === null || states === undefined) return
    this.peers = peersOf(states, link.ydoc.clientID)
    this.publish()
  }

  // --- What is unsent: the budget of protocol section 12.5 ------------------------------------------------------------

  private unsentBytes(): number {
    const link = this.link
    if (link === null) return 0
    const stored = this.lastStored === null ? undefined : Y.encodeStateVector(this.lastStored.sv)
    return Y.encodeStateAsUpdate(link.ydoc, stored).byteLength
  }

  private measureUnsent(): void {
    // Before the server has said what it stored there is nothing to measure against: its first event comes with the connection.
    if (this.lastStored === null) return
    const over = this.unsentBytes() > MAX_UNSENT_BYTES
    if (over === this.overBudget) return
    this.overBudget = over
    this.publish()
  }

  // --- The snapshot -------------------------------------------------------------------------------------------------

  private build(): CollabSnapshot {
    const link = this.link
    if (link === null) throw new Error('A session with no connection has nothing to show')
    const { cause } = this.model
    return {
      state: this.model.state === 'initial' ? 'connecting' : this.model.state,
      cause,
      action: cause === null ? null : errorAction(cause),
      editable: isEditable(this.model) && !this.overBudget,
      loaded: this.loaded,
      peers: this.peers,
      notice: this.notice,
      generation: this.generation,
      ydoc: link.ydoc,
      provider: link.provider,
    }
  }

  private publish(): void {
    if (this.link === null) return
    const next = this.build()
    if (sameSnapshot(this.current, next)) return
    this.current = next
    for (const listener of this.listeners) listener()
  }
}
