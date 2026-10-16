// `ws` ships no types and `@types/ws` is not a dependency of this workspace, so this declares what the collaboration
// tests use of it: a raw WebSocket client that can set headers, which the browser one cannot.
declare module 'ws' {
  interface ClientOptions {
    readonly headers?: Readonly<Record<string, string>>
  }

  type Listener<Arguments extends unknown[]> = (...parameters: Arguments) => void

  class WebSocket {
    constructor(address: string | URL, protocols?: string | string[], options?: ClientOptions)
    constructor(address: string | URL, options?: ClientOptions)
    static readonly OPEN: 1
    readonly readyState: number
    on(event: 'open', listener: Listener<[]>): this
    on(event: 'message', listener: Listener<[data: Buffer, isBinary: boolean]>): this
    on(event: 'close', listener: Listener<[code: number, reason: Buffer]>): this
    on(event: 'error', listener: Listener<[error: Error]>): this
    on(
      event: 'unexpected-response',
      listener: Listener<[request: import('node:http').ClientRequest, response: import('node:http').IncomingMessage]>,
    ): this
    send(data: Uint8Array | string, callback?: (error?: Error) => void): void
    close(code?: number, reason?: string): void
    terminate(): void
  }

  export default WebSocket
}
