import type { Duplex } from 'node:stream'

/**
 * The sockets of the upgrades the server accepted, from the first byte and not from the first document connection. A
 * socket that never authenticates, or whose authentication was refused (the socket stays open then, F5), belongs to no
 * document, so `destroy()` of Hocuspocus never reaches it, and it keeps the process alive until its own deadline.
 */
export class OpenSockets {
  private readonly sockets = new Set<Duplex>()
  private onEmpty: (() => void) | undefined

  track(socket: Duplex): void {
    this.sockets.add(socket)
    socket.once('close', () => {
      this.sockets.delete(socket)
      if (this.sockets.size === 0) this.onEmpty?.()
    })
  }

  get size(): number {
    return this.sockets.size
  }

  /** Waits for the sockets that were asked to close to do so, for at most `waitMs`, and destroys whatever is still open. */
  async closeAll(waitMs: number): Promise<void> {
    if (this.sockets.size > 0) {
      let timer: NodeJS.Timeout | undefined
      await new Promise<void>((resolve) => {
        this.onEmpty = resolve
        timer = setTimeout(resolve, waitMs)
      })
      clearTimeout(timer)
      this.onEmpty = undefined
    }
    for (const socket of this.sockets) socket.destroy()
  }
}
