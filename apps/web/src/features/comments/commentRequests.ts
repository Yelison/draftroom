/** What the text asks of the panel: to start a comment on the selection, or to show a thread. */
export type CommentRequest =
  | { type: 'comment' }
  /** `focus` is whether the person asked from the keyboard, and so is taken to the thread; a click leaves the focus in the text. */
  | { type: 'thread'; threadId: string; focus: boolean }

/**
 * The line between the editor and the panel. The editor is made first and the panel needs it, so the keys and the clicks
 * of the text cannot call the panel directly: they say what they want here, and the panel, once it is there, listens.
 */
export interface CommentRequests {
  send(request: CommentRequest): void
  subscribe(listener: (request: CommentRequest) => void): () => void
}

export function createCommentRequests(): CommentRequests {
  const listeners = new Set<(request: CommentRequest) => void>()
  return {
    send: (request) => listeners.forEach((listener) => listener(request)),
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}
