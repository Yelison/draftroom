/** Whether the browser has a network, and when that changes; injected so a test can take it away. */
export interface Network {
  online(): boolean
  /** Calls back when the browser goes online or offline; returns the way to stop. */
  subscribe(listener: (online: boolean) => void): () => void
}

export const browserNetwork: Network = {
  online: () => navigator.onLine,
  subscribe(listener) {
    const online = () => listener(true)
    const offline = () => listener(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  },
}
