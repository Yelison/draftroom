/**
 * The frames the Hocuspocus provider and server exchange, read and written by hand. They are LEB128 integers and
 * length-prefixed text and bytes (the `lib0` encoding), and every frame starts with the document name and a message type.
 * The simulated server speaks them to the real provider, so what is written here is what `@hocuspocus/provider` 4.7.1
 * reads: its `MessageReceiver` and `OutgoingMessages` are the source.
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** The message types of the wire protocol, in the provider's `MessageType`. */
export const MessageType = {
  Sync: 0,
  Awareness: 1,
  Auth: 2,
  QueryAwareness: 3,
  Stateless: 5,
  Close: 7,
  SyncStatus: 8,
  Ping: 9,
  Pong: 10,
} as const

/** The three messages of the Yjs sync protocol, inside a `Sync` frame. */
export const SyncType = { Step1: 0, Step2: 1, Update: 2 } as const

/** The messages of the authentication exchange, inside an `Auth` frame. */
export const AuthType = { Token: 0, PermissionDenied: 1, Authenticated: 2 } as const

/** Builds a frame piece by piece. */
export class FrameWriter {
  private readonly parts: number[] = []

  uint(value: number): this {
    let rest = value
    while (rest > 0x7f) {
      this.parts.push(0x80 | (rest & 0x7f))
      rest = Math.floor(rest / 128)
    }
    this.parts.push(rest)
    return this
  }

  string(text: string): this {
    return this.bytes(encoder.encode(text))
  }

  bytes(data: Uint8Array): this {
    this.uint(data.length)
    for (const byte of data) this.parts.push(byte)
    return this
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.parts)
  }
}

/** Reads a frame piece by piece; a frame that is cut short or malformed throws, and the server drops that message. */
export class FrameReader {
  private position = 0

  constructor(private readonly data: Uint8Array) {}

  get done(): boolean {
    return this.position >= this.data.length
  }

  uint(): number {
    let value = 0
    let scale = 1
    for (;;) {
      const byte = this.data[this.position]
      if (byte === undefined) throw new RangeError('The frame ends inside a number')
      this.position += 1
      value += (byte & 0x7f) * scale
      if (byte < 0x80) return value
      scale *= 128
    }
  }

  string(): string {
    return decoder.decode(this.bytes())
  }

  bytes(): Uint8Array {
    const length = this.uint()
    const end = this.position + length
    if (end > this.data.length) throw new RangeError('The frame ends inside a value')
    const value = this.data.slice(this.position, end)
    this.position = end
    return value
  }
}
