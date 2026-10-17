/**
 * Said by a collaboration session when the server ended the session of the person (close `4401`, protocol section 6.3):
 * the connection is the first to know, before any request the page makes. The app listens, and asks who is signed in before
 * it asks the API anything else, so that what it asks next is not answered as somebody else and taken for the loss of the
 * document.
 */
const listeners = new Set<() => void>()

export function onSessionEnded(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function announceSessionEnded(): void {
  for (const listener of [...listeners]) listener()
}
