import { documentName } from '@draftroom/contract/collab'
import WebSocket from 'ws'
import { decode, outgoing, type Incoming } from './frames.ts'
import { Waiter, waitLimitMs } from './waiter.ts'

// A WebSocket client that speaks the protocol by hand, which is what a hostile or broken one does: it can send what the
// provider never would, and it keeps every frame it receives so a test can say what it saw and in which order.

type Frame<Kind extends Incoming['kind']> = Extract<Incoming, { kind: Kind }>

const isKind = <Kind extends Incoming['kind']>(frame: Incoming, kind: Kind): frame is Frame<Kind> => frame.kind === kind

export interface Closed {
  readonly code: number
  readonly reason: string
}

export interface RawClientOptions {
  /** The person, by the development header. */
  readonly email?: string
  readonly headers?: Readonly<Record<string, string>>
}

export class RawClient {
  readonly received: Incoming[] = []
  /** Settles with the close of the socket; it never rejects. */
  readonly closed: Promise<Closed>
  private readonly socket: WebSocket
  private readonly waiter = new Waiter()
  private readonly opened: Promise<void>

  private constructor(url: string, headers: Readonly<Record<string, string>>) {
    this.socket = new WebSocket(url, { headers })
    this.opened = new Promise((resolve, reject) => {
      this.socket.on('open', resolve)
      this.socket.on('error', reject)
      // A refused upgrade is not an open socket: the response is the answer.
      this.socket.on('unexpected-response', (_request, response) => {
        reject(new Error(`The upgrade was refused with ${response.statusCode}`))
      })
    })
    // Whoever does not wait for the open must not leave its failure unhandled.
    this.opened.catch(() => undefined)
    this.closed = new Promise((resolve) => {
      this.socket.on('close', (code, reason) => resolve({ code, reason: reason.toString() }))
    })
    this.socket.on('message', (data) => {
      this.received.push(decode(data))
      this.waiter.changed()
    })
  }

  /** Connects as a person and resolves once the socket is open. */
  static async connect(url: string, { email, headers }: RawClientOptions = {}): Promise<RawClient> {
    const client = new RawClient(url, { ...(email === undefined ? {} : { 'x-dev-user': email }), ...headers })
    await client.opened
    return client
  }

  /** Tries to connect and says how the upgrade ended: the status of a refusal, or `101`. */
  static async tryConnect(url: string, options: RawClientOptions = {}): Promise<number> {
    const headers = { ...(options.email === undefined ? {} : { 'x-dev-user': options.email }), ...options.headers }
    const socket = new WebSocket(url, { headers })
    return new Promise((resolve, reject) => {
      socket.on('open', () => {
        socket.close()
        resolve(101)
      })
      socket.on('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0))
      socket.on('error', (error) => {
        // A refused upgrade also ends with a socket error once the answer is read.
        if (!/Unexpected server response/.test(error.message)) reject(error)
      })
    })
  }

  send(bytes: Uint8Array): void {
    this.socket.send(bytes)
  }

  /** The first message of a connection for a document: it carries no token, because the identity is never taken from one. */
  authenticate(documentId: string): void {
    this.send(outgoing.authenticate(documentName(documentId)))
  }

  /**
   * Authenticates and completes a handshake step, so that the server has the connection registered: the authenticated
   * answer is sent before the document is loaded, and a connection that is not registered yet cannot be ended or seen.
   */
  async join(documentId: string): Promise<void> {
    this.authenticate(documentId)
    await this.waitFor('authenticated')
    const mark = this.mark
    this.send(outgoing.syncStep1(documentName(documentId), new Uint8Array([0])))
    await this.waitFor('sync', () => true, mark)
  }

  /** Resolves with the first frame, already received or still to come, that the predicate selects. */
  waitFor<Kind extends Incoming['kind']>(
    kind: Kind,
    matches: (frame: Frame<Kind>) => boolean = () => true,
    from = 0,
  ): Promise<Frame<Kind>> {
    return this.waiter.until(
      () => this.received.slice(from).find((frame): frame is Frame<Kind> => isKind(frame, kind) && matches(frame)),
      `a ${kind} frame. Received: ${JSON.stringify(this.received.map((frame) => frame.kind))}`,
    )
  }

  /** Resolves when this many frames of a kind have arrived since the mark. */
  waitForFrames(kind: Incoming['kind'], count: number, from = 0): Promise<void> {
    return this.waiter
      .until(() => (this.framesOf(kind, from) >= count ? true : undefined), `${count} ${kind} frames`)
      .then(() => undefined)
  }

  /** How many frames of a kind have arrived since the mark. */
  framesOf(kind: Incoming['kind'], from = 0): number {
    return this.received.slice(from).filter((frame) => frame.kind === kind).length
  }

  /** The close of the socket, or a failure if it does not close. */
  async waitForClose(): Promise<Closed> {
    let timer: NodeJS.Timeout | undefined
    const limit = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('The socket did not close')), waitLimitMs)
    })
    try {
      return await Promise.race([this.closed, limit])
    } finally {
      clearTimeout(timer)
    }
  }

  /** How many frames have arrived: a mark to read "what came after this" from. */
  get mark(): number {
    return this.received.length
  }

  get isOpen(): boolean {
    return this.socket.readyState === WebSocket.OPEN
  }

  terminate(): void {
    this.socket.terminate()
  }
}
