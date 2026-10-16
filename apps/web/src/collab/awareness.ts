/** One other person in the document, as the server says they are (protocol section 5.3: it rewrites the name). */
export interface Peer {
  readonly userId: string
  readonly name: string
  readonly color: string
}

// The colour goes into styles, and the server only relays a state with a plain hexadecimal one; a state that arrives with
// anything else is not shown.
const COLOR = /^#[0-9a-fA-F]{6}$/

/** Whether a value is a colour a presence state may carry: the only form the server relays, and the one that is safe in a style. */
export const isPresenceColor = (value: unknown): value is string => typeof value === 'string' && COLOR.test(value)

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

function peerOf(state: unknown): Peer | null {
  if (!isRecord(state) || !isRecord(state['user'])) return null
  const { id, name, color } = state['user']
  if (typeof id !== 'string' || typeof name !== 'string' || !isPresenceColor(color)) return null
  return { userId: id, name, color }
}

/**
 * The people in the document other than this client's own, one entry for each person: the same person in two tabs is
 * two awareness clients and one person. The order is the order they arrived in.
 */
export function peersOf(states: ReadonlyMap<number, unknown>, ownClientId: number): Peer[] {
  const peers = new Map<string, Peer>()
  for (const [clientId, state] of states) {
    if (clientId === ownClientId) continue
    const peer = peerOf(state)
    if (peer !== null && !peers.has(peer.userId)) peers.set(peer.userId, peer)
  }
  return [...peers.values()]
}
