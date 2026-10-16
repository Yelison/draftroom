import { MAX_AWARENESS_STATE_BYTES } from '@draftroom/contract/collab'
import type { Extension } from '@hocuspocus/server'
import { z } from 'zod'
import type { ConnectionContext } from './context.ts'

// Presence is ephemeral and never used for authorisation, but it is shown to everyone, so a client must not be able to
// speak as another person or to erase their presence (protocol §5.3). The guard is `beforeHandleAwareness`, the one hook
// that runs before an update is applied (F8): `onAwarenessUpdate` runs after, and cannot change it. The hook must not
// throw, because a throw ends the document connection.

/** `user.color` goes into styles, so it is a plain hexadecimal colour or the state is not relayed. */
const colour = /^#[0-9a-fA-F]{6}$/

const userSchema = z.object({ id: z.string(), color: z.string().regex(colour) })

type State = Record<string, unknown>

/** Who is speaking: the person behind the connection, as the database says. */
export interface Speaker {
  /** The connection, to tell its awareness client ids from other connections'. */
  readonly socketId: string
  readonly userId: string
  readonly displayName: string
}

/** The awareness client ids of one document, and the connection that published each first. */
export type ClientIdOwners = Map<number, string>

/**
 * Rewrites an inbound awareness update in place so that only what this connection may say remains. The order is the
 * protocol's: ownership of the client id, size, shape, then identity.
 */
export function guardAwareness(
  { states, removedClients }: { readonly states: Map<number, State>; readonly removedClients: Set<number> },
  speaker: Speaker,
  owners: ClientIdOwners,
): void {
  for (const [clientId, state] of states) {
    // The first connection to publish an id owns it for as long as that connection lives.
    const owner = owners.get(clientId) ?? speaker.socketId
    owners.set(clientId, owner)
    if (owner !== speaker.socketId) {
      states.delete(clientId)
      continue
    }
    const safe = safeState(state, speaker)
    if (safe === null) states.delete(clientId)
    else states.set(clientId, safe)
  }
  // A removal is kept only for the ids this connection owns, so nobody erases another person's presence.
  for (const clientId of removedClients) {
    if (owners.get(clientId) !== speaker.socketId) removedClients.delete(clientId)
  }
}

/** The state as it may be relayed, or `null` when it may not be. */
function safeState(state: State, { userId, displayName }: Speaker): State | null {
  if (Buffer.byteLength(JSON.stringify(state)) > MAX_AWARENESS_STATE_BYTES) return null
  const user = userSchema.safeParse(state['user'])
  // The identity is the connection's: a state that names another person is dropped and never relayed.
  if (!user.success || user.data.id !== userId) return null
  // Only what the editor writes is kept; the name is rewritten so a client cannot show another one.
  return {
    user: { id: userId, name: displayName, color: user.data.color },
    ...(state['cursor'] === undefined ? {} : { cursor: state['cursor'] }),
  }
}

/** The ids of every document's awareness, by document name, and who published them. */
export function awarenessGuardExtension(): Extension<ConnectionContext> {
  const ownersByDocument = new Map<string, ClientIdOwners>()
  return {
    extensionName: 'draftroom-awareness-guard',

    async beforeHandleAwareness({ connection, context, documentName, socketId, states, removedClients }) {
      // An update the server itself makes has no connection and nothing to guard.
      if (connection === undefined || context === undefined) return
      let owners = ownersByDocument.get(documentName)
      if (owners === undefined) {
        owners = new Map()
        ownersByDocument.set(documentName, owners)
      }
      guardAwareness({ states, removedClients }, { socketId, ...context }, owners)
    },

    // The ids a connection published are free again once it is gone.
    async onDisconnect({ documentName, socketId }) {
      const owners = ownersByDocument.get(documentName)
      if (owners === undefined) return
      for (const [clientId, owner] of owners) if (owner === socketId) owners.delete(clientId)
    },

    async afterUnloadDocument({ documentName }) {
      ownersByDocument.delete(documentName)
    },
  }
}
