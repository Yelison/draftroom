import {
  documentName,
  parseStatelessEvent,
  type AuthorizedScope,
  type StatelessEvent,
} from '@draftroom/contract/collab'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import WebSocket from 'ws'
import * as Y from 'yjs'
import type { Closed } from './raw-client.ts'
import { Waiter } from './waiter.ts'

// A client made as the real one is: a `HocuspocusProvider` with a `Y.Doc` of its own, one WebSocket per document, no
// token and no session awareness (protocol §2 and §3.3). It differs only in the transport, a Node WebSocket that can send
// the development header, and in what it keeps, so a test can say what the client was told and when.

export interface DocumentClientOptions {
  readonly email: string
  /** A document the client already has, for a person who worked offline. */
  readonly doc?: Y.Doc
}

export class DocumentClient {
  readonly doc: Y.Doc
  readonly provider: HocuspocusProvider
  readonly stateless: StatelessEvent[] = []
  readonly closes: Closed[] = []
  scope: AuthorizedScope | undefined
  denied: string | undefined
  synced = false
  private readonly waiter = new Waiter()
  private readonly socket: HocuspocusProviderWebsocket

  private constructor(url: string, documentId: string, { email, doc }: DocumentClientOptions) {
    this.doc = doc ?? new Y.Doc()
    const person = class extends WebSocket {
      constructor(address: string | URL) {
        super(address, { headers: { 'x-dev-user': email } })
      }
    }
    this.socket = new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: person, autoConnect: false })
    this.provider = new HocuspocusProvider({
      name: documentName(documentId),
      document: this.doc,
      websocketProvider: this.socket,
      token: null,
      sessionAwareness: false,
      onAuthenticated: ({ scope }) => {
        this.scope = scope
        this.waiter.changed()
      },
      onAuthenticationFailed: ({ reason }) => {
        this.denied = reason
        this.waiter.changed()
      },
      onSynced: ({ state }) => {
        this.synced = state
        this.waiter.changed()
      },
      onStateless: ({ payload }) => {
        const event = parseStatelessEvent(payload)
        if (event !== null) this.stateless.push(event)
        this.waiter.changed()
      },
      onClose: ({ event }) => {
        this.closes.push({ code: event.code, reason: event.reason })
        this.waiter.changed()
      },
    })
    this.provider.attach()
  }

  /** Opens the document as a person and connects. */
  static open(url: string, documentId: string, options: DocumentClientOptions): DocumentClient {
    const client = new DocumentClient(url, documentId, options)
    void client.socket.connect()
    return client
  }

  /** The `stored` events received, in order. */
  get storedEvents(): readonly Extract<StatelessEvent, { type: 'stored' }>[] {
    return this.stateless.filter((event) => event.type === 'stored')
  }

  waitForScope(): Promise<AuthorizedScope> {
    return this.waiter.until(() => this.scope, 'the connection to be authorised')
  }

  waitForDenied(): Promise<string> {
    return this.waiter.until(() => this.denied, 'the connection to be refused')
  }

  /** The handshake is done: the server's state is in `doc`. */
  waitForSynced(): Promise<void> {
    return this.waiter.until(() => (this.synced ? true : undefined), 'the document to sync').then(() => undefined)
  }

  /** A `stored` event that the predicate accepts, from the ones already received or the next. */
  waitForStored(
    accepts: (snapshot: Y.Snapshot) => boolean = () => true,
    from = 0,
  ): Promise<Extract<StatelessEvent, { type: 'stored' }>> {
    return this.waiter.until(
      () =>
        this.storedEvents.slice(from).find((event) => accepts(Y.decodeSnapshot(Buffer.from(event.snapshot, 'base64')))),
      'a stored event',
    )
  }

  waitForEvent(type: StatelessEvent['type']): Promise<StatelessEvent> {
    return this.waiter.until(() => this.stateless.find((event) => event.type === type), `a ${type} event`)
  }

  waitForClose(): Promise<Closed> {
    return this.waiter.until(() => this.closes[0], 'the connection to close')
  }

  /** Waits until `doc` satisfies a condition: what another client wrote has arrived. */
  waitForDoc(description: string, holds: (doc: Y.Doc) => boolean): Promise<void> {
    const onUpdate = () => this.waiter.changed()
    this.doc.on('update', onUpdate)
    return this.waiter
      .until(() => (holds(this.doc) ? true : undefined), description)
      .then(() => undefined)
      .finally(() => this.doc.off('update', onUpdate))
  }

  destroy(): void {
    this.provider.destroy()
    this.socket.destroy()
  }
}

/** The clients a test opened, so the test file can close them all and leave no socket behind. */
export class ClientSet {
  private readonly opened: DocumentClient[] = []
  private readonly url: string

  constructor(url: string) {
    this.url = url
  }

  open(documentId: string, options: DocumentClientOptions): DocumentClient {
    const client = DocumentClient.open(this.url, documentId, options)
    this.opened.push(client)
    return client
  }

  destroyAll(): void {
    for (const client of this.opened.splice(0)) client.destroy()
  }
}
