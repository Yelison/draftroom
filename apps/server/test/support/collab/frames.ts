// The wire format of Hocuspocus messages, written out by hand for the tests that talk to the server with a raw
// WebSocket: a hostile client does not use the provider, so the tests must be able to say what it would. Each message is
// the document name as a string, a message type, and the rest by type (y-protocols and @hocuspocus/common, which the
// provider and the server share).

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

class Writer {
  private readonly bytes: number[] = []

  uint(value: number): this {
    let rest = value
    while (rest > 0x7f) {
      this.bytes.push(0x80 | (rest & 0x7f))
      rest = Math.floor(rest / 128)
    }
    this.bytes.push(rest)
    return this
  }

  raw(bytes: Uint8Array): this {
    for (const byte of bytes) this.bytes.push(byte)
    return this
  }

  string(text: string): this {
    const encoded = textEncoder.encode(text)
    return this.uint(encoded.length).raw(encoded)
  }

  array(bytes: Uint8Array): this {
    return this.uint(bytes.length).raw(bytes)
  }

  done(): Uint8Array {
    return Uint8Array.from(this.bytes)
  }
}

class Reader {
  private position = 0
  private readonly bytes: Uint8Array

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }

  uint(): number {
    let value = 0
    let scale = 1
    for (;;) {
      const byte = this.bytes[this.position++]
      if (byte === undefined) throw new RangeError('The message ends inside a number')
      value += (byte & 0x7f) * scale
      if (byte < 0x80) return value
      scale *= 128
    }
  }

  array(): Uint8Array {
    const length = this.uint()
    const bytes = this.bytes.slice(this.position, this.position + length)
    this.position += length
    return bytes
  }

  string(): string {
    return textDecoder.decode(this.array())
  }
}

const MessageType = {
  sync: 0,
  awareness: 1,
  auth: 2,
  stateless: 5,
  broadcastStateless: 6,
  close: 7,
  syncStatus: 8,
} as const
const SyncStep = { one: 0, two: 1, update: 2 } as const
const AuthType = { token: 0, permissionDenied: 1, authenticated: 2 } as const

export interface AwarenessEntry {
  readonly clientId: number
  readonly clock: number
  /** `null` removes the client. */
  readonly state: unknown
}

/** What a client sends. */
export const outgoing = {
  authenticate: (name: string, token = ''): Uint8Array =>
    new Writer().string(name).uint(MessageType.auth).uint(AuthType.token).string(token).string('test').done(),
  syncStep1: (name: string, stateVector: Uint8Array): Uint8Array =>
    new Writer().string(name).uint(MessageType.sync).uint(SyncStep.one).array(stateVector).done(),
  syncStep2: (name: string, update: Uint8Array): Uint8Array =>
    new Writer().string(name).uint(MessageType.sync).uint(SyncStep.two).array(update).done(),
  update: (name: string, update: Uint8Array): Uint8Array =>
    new Writer().string(name).uint(MessageType.sync).uint(SyncStep.update).array(update).done(),
  awareness: (name: string, entries: readonly AwarenessEntry[]): Uint8Array => {
    const body = new Writer().uint(entries.length)
    for (const { clientId, clock, state } of entries) body.uint(clientId).uint(clock).string(JSON.stringify(state))
    return new Writer().string(name).uint(MessageType.awareness).array(body.done()).done()
  },
  stateless: (name: string, payload: string): Uint8Array =>
    new Writer().string(name).uint(MessageType.stateless).string(payload).done(),
  /** The opcode that is only for the server's own use: a client that sends it makes the server throw. */
  broadcastStateless: (name: string, payload: string): Uint8Array =>
    new Writer().string(name).uint(MessageType.broadcastStateless).string(payload).done(),
}

/** What the server sends, as far as the tests look at it. */
export type Incoming =
  | { readonly kind: 'authenticated'; readonly scope: string }
  | { readonly kind: 'denied'; readonly reason: string }
  | { readonly kind: 'sync'; readonly step: 'one' | 'two' | 'update'; readonly payload: Uint8Array }
  | { readonly kind: 'awareness'; readonly states: ReadonlyMap<number, unknown> }
  | { readonly kind: 'stateless'; readonly payload: string }
  | { readonly kind: 'sync-status'; readonly saved: boolean }
  | { readonly kind: 'closed-in-band'; readonly reason: string }
  | { readonly kind: 'other'; readonly type: number }

const stepNames = ['one', 'two', 'update'] as const

export function decode(bytes: Uint8Array): Incoming {
  const reader = new Reader(bytes)
  reader.string()
  const type = reader.uint()
  switch (type) {
    case MessageType.auth: {
      const subtype = reader.uint()
      if (subtype === AuthType.authenticated) return { kind: 'authenticated', scope: reader.string() }
      if (subtype === AuthType.permissionDenied) return { kind: 'denied', reason: reader.string() }
      return { kind: 'other', type }
    }
    // The reply to a SyncStep1 (type 4) starts like a sync message: only its first part is read here.
    case MessageType.sync:
    case 4: {
      const step = stepNames[reader.uint()]
      return step === undefined ? { kind: 'other', type } : { kind: 'sync', step, payload: reader.array() }
    }
    case MessageType.awareness: {
      const body = new Reader(reader.array())
      const states = new Map<number, unknown>()
      for (let remaining = body.uint(); remaining > 0; remaining -= 1) {
        const clientId = body.uint()
        body.uint()
        states.set(clientId, JSON.parse(body.string()) as unknown)
      }
      return { kind: 'awareness', states }
    }
    case MessageType.stateless:
      return { kind: 'stateless', payload: reader.string() }
    case MessageType.syncStatus:
      return { kind: 'sync-status', saved: reader.uint() === 1 }
    case MessageType.close:
      return { kind: 'closed-in-band', reason: reader.string() }
    default:
      return { kind: 'other', type }
  }
}
