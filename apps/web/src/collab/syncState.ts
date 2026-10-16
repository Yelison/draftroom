import type {
  AuthDeniedReason,
  AuthorizedScope,
  SyncErrorCause,
  SyncEvent,
  SyncState,
} from '@draftroom/contract/collab'

/**
 * The sync-state machine of the collaboration protocol (section 8 of `docs/collab/protocol.md`), as a pure function: it
 * is given the facts it knows and an event and answers the facts and the effects to carry out. It performs none of
 * them, which is why every row of the protocol's table can be a test without a socket, a timer or a document.
 */

/**
 * What the machine can be told it is in before the first `open`; the contract's `SyncState` has no such state because
 * nothing ever shows it.
 */
export type SyncPhase = SyncState | 'initial'

/** The facts the machine tracks beyond its state (protocol section 8). */
export interface SyncModel {
  readonly state: SyncPhase
  /** Why the state is `error`; `null` in every other state. */
  readonly cause: SyncErrorCause | null
  /** What the server authorised for this connection; `null` until the first authentication of the session. */
  readonly scope: AuthorizedScope | null
  /** The provider's `synced`: the server's SyncStep2 of the current connection arrived. */
  readonly handshakeDone: boolean
  readonly unsyncedChanges: number
  /** Whether the session holds changes the server has not been proven to have stored (`pending`, section 7.4). */
  readonly hasPending: boolean
  readonly online: boolean
  readonly hasLocalCopy: boolean
  /** True once this editor session, or the local copy it started from, was authorised. */
  readonly hasBeenAuthorized: boolean
}

/** What the caller must do for a transition; the machine only names it. */
export type SyncEffect =
  /** Start the `STORED_ACK_TIMEOUT_MS` timer, or start it over when it is running. */
  | { readonly type: 'start-ack-timer' }
  | { readonly type: 'stop-ack-timer' }
  /** Stop the provider from connecting by itself. */
  | { readonly type: 'disconnect' }
  | { readonly type: 'connect' }
  /** `disconnect()` and then `connect()`, also when the socket is still open. */
  | { readonly type: 'reopen' }
  /** Close the connection and open it again after the delay of the client's own back-off (protocol section 6.5). */
  | { readonly type: 'retry-with-backoff' }
  | { readonly type: 'purge-local-copy' }
  /** A downgrade to read-only with changes that were never stored: drop them and open again from the server. */
  | { readonly type: 'discard-offline-changes' }

export interface SyncStep {
  readonly model: SyncModel
  readonly effects: readonly SyncEffect[]
}

export function createSyncModel({ online, hasLocalCopy }: { online: boolean; hasLocalCopy: boolean }): SyncModel {
  return {
    state: 'initial',
    cause: null,
    scope: null,
    handshakeDone: false,
    unsyncedChanges: 0,
    hasPending: false,
    online,
    hasLocalCopy,
    hasBeenAuthorized: hasLocalCopy,
  }
}

const unchanged = (model: SyncModel): SyncStep => ({ model, effects: [] })

/** `error` with a cause that ends the connection: only `store-timeout` leaves it up. */
export const isStopped = (model: SyncModel): boolean => model.state === 'error' && model.cause !== 'store-timeout'

/** Whether the guard of section 7.4 holds: the only condition under which "Synced" may be said. */
export function isStored(model: SyncModel): boolean {
  return model.scope === 'read-write' && model.handshakeDone && model.unsyncedChanges === 0 && !model.hasPending
}

/** Whether the editor accepts edits in this state (section 8.1); the unsent-bytes budget of section 12.5 comes on top. */
export function isEditable(model: SyncModel): boolean {
  if (model.scope === 'readonly') return false
  switch (model.state) {
    case 'synchronising':
    case 'synced':
    case 'reconnecting':
    case 'offline-local':
      return true
    case 'error':
      return model.cause === 'store-timeout'
    default:
      return false
  }
}

/** The action `error` offers: everything is retried except a document that is too large, which has to be reloaded. */
export const errorAction = (cause: SyncErrorCause): 'retry' | 'discard-and-reload' =>
  cause === 'document-too-large' ? 'discard-and-reload' : 'retry'

/** In `synchronising` when the guard does not hold, in `synced` when it does. */
const settle = (model: SyncModel): SyncModel => ({
  ...model,
  state: isStored(model) ? 'synced' : 'synchronising',
  cause: null,
})

/** What a connection that is gone leaves behind: the handshake and the counter belong to the connection. */
const withoutConnection = (model: SyncModel): SyncModel => ({ ...model, handshakeDone: false, unsyncedChanges: 0 })

function stop(model: SyncModel, cause: SyncErrorCause): SyncStep {
  return { model: { ...withoutConnection(model), state: 'error', cause }, effects: [{ type: 'disconnect' }] }
}

function revoke(model: SyncModel): SyncStep {
  return {
    model: { ...withoutConnection(model), state: 'revoked', cause: null, hasPending: false },
    effects: [{ type: 'purge-local-copy' }, { type: 'disconnect' }],
  }
}

/** Going without a connection while the browser is offline: nothing to retry until it is back. */
function goOffline(model: SyncModel): SyncStep {
  return {
    model: { ...withoutConnection(model), state: 'offline-local', cause: null },
    effects: [{ type: 'disconnect' }],
  }
}

function lose(model: SyncModel, online: boolean): SyncStep {
  const next = { ...model, online }
  switch (next.state) {
    case 'connecting':
      return online || !next.hasLocalCopy ? unchanged(withoutConnection(next)) : goOffline(next)
    case 'offline-local':
      return online
        ? { model: { ...withoutConnection(next), state: 'reconnecting' }, effects: [] }
        : unchanged(withoutConnection(next))
    case 'synchronising':
    case 'synced':
    case 'read-only':
    case 'reconnecting':
    case 'error':
      return online
        ? { model: { ...withoutConnection(next), state: 'reconnecting', cause: null }, effects: [] }
        : goOffline(next)
    default:
      return unchanged(next)
  }
}

function changeNetwork(model: SyncModel, online: boolean): SyncStep {
  const next = { ...model, online }
  if (next.state === 'offline-local' && online) {
    return { model: { ...next, state: 'reconnecting' }, effects: [{ type: 'connect' }] }
  }
  if (online) return unchanged(next)
  const loses =
    next.state === 'connecting'
      ? next.hasLocalCopy
      : ['synchronising', 'synced', 'read-only', 'reconnecting'].includes(next.state) ||
        (next.state === 'error' && next.cause === 'store-timeout')
  return loses ? goOffline(next) : unchanged(next)
}

function deny(model: SyncModel, reason: AuthDeniedReason): SyncStep {
  switch (reason) {
    case 'unauthenticated':
      return stop(model, 'unauthenticated')
    case 'not-found':
      // The server answers "not found" for a document that is gone and for one the person lost: after having had it, it is
      // the second, and the copy must go. Before, it is a document that was never theirs.
      return model.hasBeenAuthorized ? revoke(model) : stop(model, 'not-found')
    case 'unavailable': {
      // A fault of the server, not an answer about the person: it is a connection that could not be made, whatever the state
      // was, so the copy stays and the editor stays as it was. A stopped error is not one that is made again by this.
      if (isStopped(model)) return unchanged(model)
      const lost = lose(model, model.online)
      const tryAgain = lost.model.state === 'reconnecting' || lost.model.state === 'connecting'
      // The browser being offline is for the network to say when it is back, and is not retried on a schedule.
      return tryAgain ? { model: lost.model, effects: [...lost.effects, { type: 'retry-with-backoff' }] } : lost
    }
  }
}

function authenticate(model: SyncModel, scope: AuthorizedScope): SyncStep {
  if (model.state !== 'connecting' && model.state !== 'reconnecting' && model.state !== 'offline-local') {
    return unchanged(model)
  }
  const next = { ...model, scope, hasBeenAuthorized: true }
  if (scope === 'read-write') return { model: settle({ ...next, state: 'synchronising' }), effects: [] }
  // A reader never has anything of its own to store: what an editor made offline is not accepted by the server.
  return {
    model: { ...next, state: 'read-only', cause: null, hasPending: false },
    effects: model.hasPending ? [{ type: 'discard-offline-changes' }] : [],
  }
}

function apply(model: SyncModel, event: SyncEvent): SyncStep {
  if (model.state === 'revoked') return unchanged(model)

  switch (event.type) {
    case 'open':
      if (model.state === 'initial') return unchanged({ ...model, state: 'connecting' })
      if (model.state !== 'error') return unchanged(model)
      return {
        // A document that is too large is opened again only after the person discarded their local changes (a retry would
        // send the same message again), so what was pending went with them.
        model: {
          ...withoutConnection(model),
          state: 'connecting',
          cause: null,
          hasPending: model.cause === 'document-too-large' ? false : model.hasPending,
        },
        effects: [{ type: 'reopen' }],
      }

    case 'authenticated':
      return authenticate(model, event.scope)

    case 'authentication-denied':
      return deny(model, event.reason)

    case 'document-too-large':
      return stop(model, 'document-too-large')

    case 'connection-closed':
      if (event.code === 4403) return revoke(model)
      if (event.code === 4401) return stop(model, 'unauthenticated')
      if (event.code === 4413 || event.code === 1009) return stop(model, 'document-too-large')
      return isStopped(model) || model.state === 'initial'
        ? unchanged({ ...model, online: event.online })
        : lose(model, event.online)

    case 'network-changed':
      return changeNetwork(model, event.online)

    case 'handshake-completed':
      return model.state === 'synchronising' ? unchanged(settle({ ...model, handshakeDone: true })) : unchanged(model)

    case 'local-change':
      if (model.state === 'read-only' || model.state === 'initial' || isStopped(model)) return unchanged(model)
      return unchanged({ ...model, hasPending: true, state: model.state === 'synced' ? 'synchronising' : model.state })

    case 'unsynced-changes-changed': {
      if (model.state === 'read-only' || model.state === 'initial' || isStopped(model)) return unchanged(model)
      const next = { ...model, unsyncedChanges: event.count }
      if (next.state === 'synced') return unchanged(event.count > 0 ? { ...next, state: 'synchronising' } : next)
      return unchanged(next.state === 'synchronising' ? settle(next) : next)
    }

    case 'stored': {
      if (model.state === 'read-only' || model.state === 'initial' || isStopped(model) || !event.coversLocalChanges) {
        return unchanged(model)
      }
      const next = { ...model, hasPending: false }
      // Where nothing settles, the covering `stored` is only remembered, and takes effect once the state is `synchronising`.
      return unchanged(next.state === 'synchronising' || next.state === 'error' ? settle(next) : next)
    }

    case 'stored-ack-timeout':
      return model.state === 'synchronising'
        ? unchanged({ ...model, state: 'error', cause: 'store-timeout' })
        : unchanged(model)
  }
}

/** Whether the 15 s wait for a covering `stored` is running: the server took the changes and has not said it stored them. */
const waitsForStored = (model: SyncModel): boolean =>
  model.state === 'synchronising' && model.handshakeDone && model.unsyncedChanges === 0 && model.hasPending

function timerEffects(before: SyncModel, after: SyncModel, event: SyncEvent): SyncEffect[] {
  const wasWaiting = waitsForStored(before)
  const waits = waitsForStored(after)
  // Each change of the person starts the wait over, so a document that is being typed in never times out.
  if (waits && (!wasWaiting || event.type === 'local-change')) return [{ type: 'start-ack-timer' }]
  return !waits && wasWaiting ? [{ type: 'stop-ack-timer' }] : []
}

/** The next facts and the effects for an event; the effects are in the order they must run. */
export function transition(model: SyncModel, event: SyncEvent): SyncStep {
  const step = apply(model, event)
  return { model: step.model, effects: [...step.effects, ...timerEffects(model, step.model, event)] }
}
