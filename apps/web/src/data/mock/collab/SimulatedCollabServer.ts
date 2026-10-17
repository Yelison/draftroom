import {
  LIBRARY_CLOSE_CODES,
  MAX_MESSAGE_BYTES,
  STORE_DEBOUNCE_MS,
  parseDocumentName,
  serializeStatelessEvent,
  type StatelessEvent,
} from '@draftroom/contract/collab'
import * as Y from 'yjs'
import { isPresenceColor, isRecord } from '../../../collab/awareness.ts'
import { toBase64 } from '../../../collab/base64.ts'
import { AuthType, FrameReader, FrameWriter, MessageType, SyncType } from './wire.ts'

/**
 * A collaboration server that lives in the page: it speaks the Hocuspocus wire protocol to the real provider through the
 * `WebSocketPolyfill` hook, so the client code that runs against it is the code that runs against the real server, and
 * only the network is made up. It is the mock's collaboration, and it is what the unit tests of the client talk to.
 *
 * It follows `docs/collab/protocol.md`: the connection is authenticated before anything is applied, a reader's updates
 * are answered `SyncStatus(false)` and not applied, the awareness a connection sends is made to say who it really is,
 * every write is acknowledged in memory at once and as stored a debounce later with a snapshot of exactly what was
 * stored, and the limits that close a connection do. It is a simulation: nothing in it is proof about the real server,
 * whose own tests are the proof.
 */

export interface Identity {
  readonly userId: string
  readonly displayName: string
}

/** What a person may do with a document; `denied` carries the reason the server answers `PermissionDenied` with. */
export type Access = { readonly scope: 'read-write' | 'readonly' } | { readonly denied: string }

export interface SimulatedServerOptions {
  /** Called when a connection authenticates; `identity` is `null` when nobody is signed in. */
  authorize(documentName: string, identity: Identity | null): Access
  /** How long authenticating and loading the document take. */
  loadDelayMs?: number
  /** How long after a change the document is stored. */
  storeDelayMs?: number
  /** How often a connection is pinged: the provider closes a connection that hears nothing for 30 s. */
  pingIntervalMs?: number
  /** What a connection may send before its authentication finishes (protocol section 3.1). */
  unauthenticatedLimits?: { messages: number; bytes: number }
  /** The Yjs update a document starts with, when it is first needed: what the server holds before anyone has written. */
  initialContent?(documentName: string): Uint8Array | undefined
}

/** What changed in the awareness of a client: the state is `null` when it left. */
export interface AwarenessChange {
  readonly clientId: number
  readonly clock: number
  readonly state: unknown
}

/** Who hears what happens on the server, besides the connections: another tab's copy of this server, a script. */
export interface RoomObserver {
  /** A document was opened on this server for the first time. */
  created?(documentName: string): void
  /** A document changed by something of this server's own; what `receiveUpdate` brings in is not reported back. */
  updated?(documentName: string, update: Uint8Array): void
  /** The awareness of connections of this server changed; what `receiveAwareness` brings in is not reported back. */
  awareness?(documentName: string, changes: readonly AwarenessChange[]): void
  /** A person's connection was authenticated on a document, or ended. */
  joined?(documentName: string, userId: string): void
  left?(documentName: string, userId: string): void
}

const defaults = {
  initialContent: (): undefined => undefined,
  loadDelayMs: 0,
  storeDelayMs: STORE_DEBOUNCE_MS,
  pingIntervalMs: 10_000,
  unauthenticatedLimits: { messages: 64, bytes: 256 * 1024 },
}

// `readyState` values of a WebSocket.
const CONNECTING = 0
const OPEN = 1
const CLOSED = 3

type Listener = (event: Event) => void

/** The part of a WebSocket the provider uses. */
export class SimulatedSocket {
  binaryType = 'arraybuffer'
  readyState = 0
  private closing = false
  private readonly listeners = new Map<string, Set<Listener>>()

  constructor(
    readonly url: string,
    private readonly peer: Connection,
  ) {}

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener)
  }

  send(data: Uint8Array): void {
    if (this.readyState === OPEN && !this.closing) this.peer.receive(data)
  }

  /** The client ends the connection; like a browser's, the close is reported afterwards and without a code. */
  close(): void {
    // A socket closed before it opened is an error in a real one: the browser logs it and `ws` raises it.
    if (this.readyState === CONNECTING) this.peer.aborted()
    this.end(1005, '')
  }

  /** @internal Delivers an event of the connection, in order with the others. */
  dispatch(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  /**
   * @internal Whichever side ends the connection, the client hears one close event and nothing after it. What was already on
   * its way is heard first, in order, as `ws` does it (protocol section 6.3: the event that explains a close arrives before it).
   */
  end(code: number, reason: string): void {
    if (this.closing || this.readyState === CLOSED) return
    this.closing = true
    this.peer.drop()
    queueMicrotask(() => {
      this.readyState = CLOSED
      this.dispatch('close', Object.assign(new Event('close'), { code, reason, wasClean: true }))
    })
  }

  /** @internal */
  opened(): void {
    this.readyState = OPEN
    this.dispatch('open', new Event('open'))
  }
}

export type SimulatedSocketConstructor = new (url: string) => SimulatedSocket

function socketClass(
  server: SimulatedCollabServer,
  identity: Identity | null,
  register: (connection: Connection) => void,
): SimulatedSocketConstructor {
  return class extends SimulatedSocket {
    constructor(url: string) {
      const peer = new Connection(server, identity)
      super(url, peer)
      register(peer)
      peer.attach(this)
    }
  }
}

/** What stands for a tab of the same demo whose people are in a room: the owner of the awareness it brought in. */
interface RemotePeer {
  readonly peerId: string
}

interface AwarenessEntry {
  clock: number
  state: unknown
  owner: Connection | RemotePeer
}

/** The origin of an update that came from another tab: the server does not send it on again. */
const REMOTE = Symbol('remote')

interface DocumentRoom {
  readonly name: string
  readonly doc: Y.Doc
  readonly connections: Set<Connection>
  readonly awareness: Map<number, AwarenessEntry>
  /** The last state that was stored, as `Y.encodeSnapshot` writes it: an empty document is stored from the start. */
  lastStored: Uint8Array
  dirty: boolean
  storeTimer: ReturnType<typeof setTimeout> | null
  retries: number
}

export class Connection {
  private room: DocumentRoom | null = null
  private scope: 'read-write' | 'readonly' | null = null
  private authenticationStarted = false
  private readonly buffered: Uint8Array[] = []
  private bufferedBytes = 0
  private ping: ReturnType<typeof setInterval> | null = null
  private closed = false
  /** @internal */
  socket: SimulatedSocket | null = null

  constructor(
    private readonly server: SimulatedCollabServer,
    readonly identity: Identity | null,
  ) {}

  get isWritable(): boolean {
    return this.scope === 'read-write'
  }

  get authenticated(): boolean {
    return this.scope !== null
  }

  /** @internal */
  attach(socket: SimulatedSocket): void {
    this.socket = socket
    queueMicrotask(() => {
      if (this.closed) return
      socket.opened()
      const { pingIntervalMs } = this.server.settings
      this.ping = setInterval(() => this.deliver(Uint8Array.of(MessageType.Ping)), pingIntervalMs)
    })
  }

  /** @internal Called by the socket for each frame the client sends. */
  receive(data: Uint8Array): void {
    if (this.closed) return
    // The transport refuses a message above `maxPayload` before the server sees it, and closes with 1009 (F7).
    if (data.length > MAX_MESSAGE_BYTES) {
      this.end(LIBRARY_CLOSE_CODES['message-too-big'], 'message-too-big')
      return
    }
    const reader = new FrameReader(data)
    let documentName: string
    let type: number
    try {
      documentName = reader.string()
      type = reader.uint()
    } catch {
      return
    }
    if (type === MessageType.Pong) return
    if (this.scope === null) {
      this.buffer(data, documentName, type)
      return
    }
    this.handle(documentName, type, reader)
  }

  private buffer(data: Uint8Array, documentName: string, type: number): void {
    const { messages, bytes } = this.server.settings.unauthenticatedLimits
    this.buffered.push(data)
    this.bufferedBytes += data.length
    if (this.buffered.length > messages || this.bufferedBytes > bytes) {
      this.end(LIBRARY_CLOSE_CODES['connection-reset'], 'connection-reset')
      return
    }
    if (type === MessageType.Auth && !this.authenticationStarted) {
      this.authenticationStarted = true
      setTimeout(
        () => this.server.whenAuthenticationMayRun(() => this.authenticate(documentName)),
        this.server.settings.loadDelayMs,
      )
    }
  }

  private authenticate(documentName: string): void {
    if (this.closed) return
    const access: Access =
      parseDocumentName(documentName) === null
        ? { denied: 'not-found' }
        : this.identity === null
          ? { denied: 'unauthenticated' }
          : this.server.settings.authorize(documentName, this.identity)
    if ('denied' in access) {
      // The socket stays open (the hook cannot reach it), and what was buffered is dropped with the refused document.
      this.buffered.length = 0
      this.deliver(
        new FrameWriter()
          .string(documentName)
          .uint(MessageType.Auth)
          .uint(AuthType.PermissionDenied)
          .string(access.denied)
          .toBytes(),
      )
      return
    }
    this.scope = access.scope
    this.deliver(
      new FrameWriter()
        .string(documentName)
        .uint(MessageType.Auth)
        .uint(AuthType.Authenticated)
        .string(access.scope)
        .toBytes(),
    )
    const room = this.server.roomOf(documentName)
    this.room = room
    room.connections.add(this)
    this.tellObservers((observer, userId) => observer.joined?.(room.name, userId))
    for (const data of this.buffered.splice(0)) this.receive(data)
    this.deliver(this.syncStep1(room))
    if (this.isWritable) this.deliver(this.storedEvent(room))
    this.deliver(this.awarenessFrame(room, [...room.awareness.keys()]))
  }

  private handle(documentName: string, type: number, reader: FrameReader): void {
    const room = this.room
    if (room === null || documentName !== room.name) return
    try {
      switch (type) {
        case MessageType.Sync:
          this.handleSync(room, reader)
          break
        case MessageType.Awareness:
          this.handleAwareness(room, reader.bytes())
          break
        case MessageType.QueryAwareness:
          this.deliver(this.awarenessFrame(room, [...room.awareness.keys()]))
          break
        case MessageType.Close:
          this.leave()
          break
        default:
      }
    } catch {
      // A message that cannot be read ends that document connection in band, with the socket left open (F8).
      // This text is also what `e2e/production-bundle.spec.ts` looks for, to know that the simulator is not in a real build.
      this.endInBand('malformed-message')
    }
  }

  private handleSync(room: DocumentRoom, reader: FrameReader): void {
    const syncType = reader.uint()
    if (syncType === SyncType.Step1) {
      const update = Y.encodeStateAsUpdate(room.doc, reader.bytes())
      this.deliver(
        new FrameWriter().string(room.name).uint(MessageType.Sync).uint(SyncType.Step2).bytes(update).toBytes(),
      )
      return
    }
    const update = reader.bytes()
    if (!this.isWritable) {
      // The handshake of a reader sends a SyncStep2 that adds nothing; a document update is a change it should not make.
      if (syncType === SyncType.Update) this.server.updatesFromReaders += 1
      this.status(room, false)
      return
    }
    Y.applyUpdate(room.doc, update, this)
    this.status(room, true)
  }

  private handleAwareness(room: DocumentRoom, update: Uint8Array): void {
    const identity = this.identity
    if (identity === null) return
    const reader = new FrameReader(update)
    const count = reader.uint()
    const changed: number[] = []
    for (let index = 0; index < count; index += 1) {
      const clientId = reader.uint()
      const clock = reader.uint()
      const state: unknown = JSON.parse(reader.string())
      const current = room.awareness.get(clientId)
      // The first connection to publish a client id owns it: nobody else may speak as it or remove it.
      if (current !== undefined && current.owner !== this) continue
      if (state === null) {
        if (current === undefined) continue
        room.awareness.set(clientId, { clock, state: null, owner: this })
        changed.push(clientId)
        continue
      }
      const safe = guardedState(state, identity)
      if (safe === null) continue
      room.awareness.set(clientId, { clock, state: safe, owner: this })
      changed.push(clientId)
    }
    this.server.relayAwareness(room, changed, this)
  }

  /** The awareness this connection has published, ended: what leaving a document does. */
  private forgetAwareness(room: DocumentRoom): void {
    const gone: number[] = []
    for (const [clientId, entry] of room.awareness) {
      if (entry.owner !== this || entry.state === null) continue
      room.awareness.set(clientId, { clock: entry.clock + 1, state: null, owner: this })
      gone.push(clientId)
    }
    this.server.relayAwareness(room, gone, this)
  }

  private status(room: DocumentRoom, applied: boolean): void {
    this.deliver(
      new FrameWriter()
        .string(room.name)
        .uint(MessageType.SyncStatus)
        .uint(applied ? 1 : 0)
        .toBytes(),
    )
  }

  private syncStep1(room: DocumentRoom): Uint8Array {
    return new FrameWriter()
      .string(room.name)
      .uint(MessageType.Sync)
      .uint(SyncType.Step1)
      .bytes(Y.encodeStateVector(room.doc))
      .toBytes()
  }

  /** @internal */
  storedEvent(room: DocumentRoom): Uint8Array {
    return this.stateless(room, { type: 'stored', snapshot: toBase64(room.lastStored) })
  }

  /** @internal */
  stateless(room: DocumentRoom, event: StatelessEvent): Uint8Array {
    return new FrameWriter()
      .string(room.name)
      .uint(MessageType.Stateless)
      .string(serializeStatelessEvent(event))
      .toBytes()
  }

  /** @internal */
  awarenessFrame(room: DocumentRoom, clientIds: readonly number[]): Uint8Array {
    return awarenessFrame(room, clientIds)
  }

  /** @internal */
  deliver(data: Uint8Array): void {
    const socket = this.socket
    if (this.closed || socket === null) return
    // A fresh buffer each time: the provider hands the array on and the receiver may keep it.
    const copy = data.slice().buffer
    queueMicrotask(() => {
      if (socket.readyState === OPEN) socket.dispatch('message', Object.assign(new Event('message'), { data: copy }))
    })
  }

  /** Ends the document connection and leaves the socket open: what a hook that throws does (F6, F8). */
  endInBand(reason: string): void {
    const room = this.room
    if (room === null) return
    this.deliver(new FrameWriter().string(room.name).uint(MessageType.Close).string(reason).toBytes())
    this.leave()
  }

  /** Ends the WebSocket with a code, the way the server ends a connection (protocol section 6.1). */
  end(code: number, reason: string): void {
    if (this.closed) return
    this.server.closes.push({ code, reason })
    this.socket?.end(code, reason)
  }

  private leave(): void {
    const room = this.room
    if (room === null) return
    this.forgetAwareness(room)
    room.connections.delete(this)
    this.room = null
    this.scope = null
    this.tellObservers((observer, userId) => observer.left?.(room.name, userId))
  }

  private tellObservers(tell: (observer: RoomObserver, userId: string) => void): void {
    const { identity } = this
    if (identity !== null) this.server.observers.forEach((observer) => tell(observer, identity.userId))
  }

  /** @internal The client closed the socket before it opened. */
  aborted(): void {
    this.server.abortedConnections += 1
  }

  /** @internal The socket is gone. */
  drop(): void {
    this.closed = true
    this.server.forget(this)
    if (this.ping !== null) clearInterval(this.ping)
    this.leave()
  }
}

function awarenessFrame(room: DocumentRoom, clientIds: readonly number[]): Uint8Array {
  const update = new FrameWriter().uint(clientIds.length)
  for (const clientId of clientIds) {
    const entry = room.awareness.get(clientId)
    if (entry === undefined) continue
    update.uint(clientId).uint(entry.clock).string(JSON.stringify(entry.state))
  }
  return new FrameWriter().string(room.name).uint(MessageType.Awareness).bytes(update.toBytes()).toBytes()
}

/** What the awareness guard (protocol section 5.3) lets through: the person, under the name the server knows, and the caret. */
function guardedState(state: unknown, { userId, displayName }: Identity): Record<string, unknown> | null {
  if (!isRecord(state) || !isRecord(state['user'])) return null
  const { id, color } = state['user']
  if (id !== userId || !isPresenceColor(color)) return null
  const { cursor } = state
  return { user: { id: userId, name: displayName, color }, ...(cursor === undefined ? {} : { cursor }) }
}

function isRemoteOf(owner: Connection | RemotePeer, peerId: string): boolean {
  return !(owner instanceof Connection) && owner.peerId === peerId
}

export class SimulatedCollabServer {
  readonly settings: Required<SimulatedServerOptions>
  private readonly rooms = new Map<string, DocumentRoom>()
  private readonly open = new Set<Connection>()
  /** @internal */
  readonly observers = new Set<RoomObserver>()
  /** How many sockets a client closed before they opened: what a browser logs as an error and `ws` raises. */
  abortedConnections = 0
  /** How many document updates connections that may only read sent: a client that behaves sends none. */
  updatesFromReaders = 0
  /** Every close the server made, in order: what a test reads to know that the server ended a connection and why. */
  readonly closes: { code: number; reason: string }[] = []
  private heldAuthentications: (() => void)[] | null = null
  private storesFail = false
  private storesHeld = false

  constructor(options: SimulatedServerOptions) {
    this.settings = { ...defaults, ...options }
  }

  /** The WebSocket the provider is given: every connection made with it is `identity`, who is `null` when signed out. */
  socketFor(identity: Identity | null): SimulatedSocketConstructor {
    return socketClass(this, identity, (connection) => this.open.add(connection))
  }

  /** The Yjs document of a name: what a test seeds, and what the server stores and serves. */
  document(documentName: string): Y.Doc {
    return this.roomOf(documentName).doc
  }

  /** @internal */
  roomOf(documentName: string): DocumentRoom {
    const existing = this.rooms.get(documentName)
    if (existing !== undefined) return existing
    const doc = new Y.Doc()
    const initial = this.settings.initialContent(documentName)
    if (initial !== undefined) Y.applyUpdate(doc, initial)
    const room: DocumentRoom = {
      name: documentName,
      doc,
      connections: new Set(),
      awareness: new Map(),
      lastStored: Y.encodeSnapshot(Y.snapshot(doc)),
      dirty: false,
      storeTimer: null,
      retries: 0,
    }
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== REMOTE) this.observers.forEach((observer) => observer.updated?.(documentName, update))
      for (const connection of room.connections) {
        if (connection === origin) continue
        connection.deliver(
          new FrameWriter().string(room.name).uint(MessageType.Sync).uint(SyncType.Update).bytes(update).toBytes(),
        )
      }
      room.dirty = true
      this.scheduleStore(room)
    })
    this.rooms.set(documentName, room)
    this.observers.forEach((observer) => observer.created?.(documentName))
    return room
  }

  /** Reports what happens on the server to `observer`; returns what stops it. */
  observe(observer: RoomObserver): () => void {
    this.observers.add(observer)
    return () => this.observers.delete(observer)
  }

  /** Whether a document has been opened on this server: asking for it never opens it. */
  hasDocument(documentName: string): boolean {
    return this.rooms.has(documentName)
  }

  // --- What another tab of the demo brings in -----------------------------------------------------------------------

  /** Applies a change another tab made, and gives it to the connections here as any other; it is not reported back. */
  receiveUpdate(documentName: string, update: Uint8Array): void {
    Y.applyUpdate(this.roomOf(documentName).doc, update, REMOTE)
  }

  /** Shows the connections here the awareness of people connected to another tab; `peerId` owns those client ids. */
  receiveAwareness(documentName: string, peerId: string, changes: readonly AwarenessChange[]): void {
    const room = this.rooms.get(documentName)
    if (room === undefined) return
    const accepted: number[] = []
    for (const { clientId, clock, state } of changes) {
      const current = room.awareness.get(clientId)
      if (current !== undefined && (!isRemoteOf(current.owner, peerId) || current.clock > clock)) continue
      room.awareness.set(clientId, { clock, state, owner: { peerId } })
      accepted.push(clientId)
    }
    this.relayAwareness(room, accepted, null)
  }

  /** The awareness this server's connections have in a document, as changes: what another tab is told when it opens it. */
  awarenessOf(documentName: string): readonly AwarenessChange[] {
    const room = this.rooms.get(documentName)
    if (room === undefined) return []
    return [...room.awareness]
      .filter(([, entry]) => entry.owner instanceof Connection && entry.state !== null)
      .map(([clientId, { clock, state }]) => ({ clientId, clock, state }))
  }

  /** Ends the awareness of everyone who was connected to a tab that has gone. */
  dropPeer(peerId: string): void {
    for (const room of this.rooms.values()) {
      const gone: number[] = []
      for (const [clientId, entry] of room.awareness) {
        if (!isRemoteOf(entry.owner, peerId) || entry.state === null) continue
        room.awareness.set(clientId, { clock: entry.clock + 1, state: null, owner: entry.owner })
        gone.push(clientId)
      }
      this.relayAwareness(room, gone, null)
    }
  }

  /** Makes every connection wait to be authenticated, as a server that cannot be reached for a moment does, until `release`. */
  holdAuthentication(): void {
    this.heldAuthentications ??= []
  }

  releaseAuthentication(): void {
    const waiting = this.heldAuthentications ?? []
    this.heldAuthentications = null
    for (const authenticate of waiting) authenticate()
  }

  /** @internal */
  whenAuthenticationMayRun(authenticate: () => void): void {
    if (this.heldAuthentications === null) authenticate()
    else this.heldAuthentications.push(authenticate)
  }

  /** @internal */
  forget(connection: Connection): void {
    this.open.delete(connection)
  }

  /** @internal Tells the others in the room what changed in the awareness of `from`, and the observers when it was a connection of this server. */
  relayAwareness(room: DocumentRoom, clientIds: readonly number[], from: Connection | null): void {
    if (clientIds.length === 0) return
    for (const connection of room.connections) {
      if (connection !== from) connection.deliver(awarenessFrame(room, clientIds))
    }
    if (from === null) return
    const changes = clientIds.flatMap((clientId) => {
      const entry = room.awareness.get(clientId)
      return entry === undefined ? [] : [{ clientId, clock: entry.clock, state: entry.state }]
    })
    this.observers.forEach((observer) => observer.awareness?.(room.name, changes))
  }

  // --- The store: a debounce after a change, acknowledged with the snapshot of what was stored -------------------

  private scheduleStore(room: DocumentRoom): void {
    if (room.storeTimer !== null) return
    room.storeTimer = setTimeout(() => this.store(room), this.settings.storeDelayMs)
  }

  private store(room: DocumentRoom): void {
    room.storeTimer = null
    if (this.storesHeld) return
    if (this.storesFail) {
      // A failed write sends nothing and is tried again without another change (protocol section 7.2).
      room.retries += 1
      room.storeTimer = setTimeout(() => this.store(room), Math.min(1000 * 2 ** (room.retries - 1), 30_000))
      return
    }
    room.retries = 0
    room.dirty = false
    room.lastStored = Y.encodeSnapshot(Y.snapshot(room.doc))
    for (const connection of room.connections) {
      if (connection.isWritable) connection.deliver(connection.storedEvent(room))
    }
  }

  /** Makes every write fail, as a database that is down does, until `false`: the server keeps retrying on its own. */
  failStores(fail: boolean): void {
    this.storesFail = fail
  }

  /** Holds every store back, as a slow database does, until `release`: the writes are acknowledged and not stored. */
  holdStores(): void {
    this.storesHeld = true
  }

  releaseStores(): void {
    this.storesHeld = false
    for (const room of this.rooms.values()) if (room.dirty) this.scheduleStore(room)
  }

  // --- What a test makes the server do ----------------------------------------------------------------------------

  /** Ends every connection with a close code, as the server does (revocation, rate limit, a restart). */
  closeConnections(code: number, reason: string): void {
    for (const connection of [...this.open]) connection.end(code, reason)
  }

  /** Ends every document connection in band, leaving the sockets open. */
  endInBand(reason = 'closed'): void {
    for (const room of this.rooms.values()) for (const connection of [...room.connections]) connection.endInBand(reason)
  }

  /** Sends a stateless event to every connection of the document, readers included: the events a test makes it send are the ones every connection gets. */
  broadcast(documentName: string, event: StatelessEvent): void {
    const room = this.roomOf(documentName)
    for (const connection of room.connections) connection.deliver(connection.stateless(room, event))
  }

  /** The connections that are open on a document. */
  connectionsTo(documentName: string): number {
    return this.roomOf(documentName).connections.size
  }
}
