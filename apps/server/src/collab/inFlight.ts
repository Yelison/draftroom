import type { Extension } from '@hocuspocus/server'
import { endConnection, selects, type ClosePlan, type ConnectionSelector } from './closeConnections.ts'
import type { ConnectionContext } from './context.ts'

// A revocation looks for the connections a document has, and a connection that is still being established has none yet:
// `onAuthenticate` has read the person's role, but the connection is registered only after the document has loaded (and
// after the hooks that follow), which can take as long as the database takes. A revocation that falls in that gap would
// find nothing, and the connection would be established afterwards with the role the person no longer has. The same holds
// for a change of role and for the end of a session. So each revocation also leaves a mark, and a connection that
// registers afterwards is closed by the mark if the mark is newer than its authentication.
//
// How long a mark lives is not a matter of time: Hocuspocus counts a connection as authenticated as soon as `onAuthenticate`
// ends, so what the load takes afterwards is limited only by the idleness of the socket, which presence renews. A mark
// lives for as long as some connection that took its ticket before the mark has not yet registered.

interface Mark {
  readonly selector: ConnectionSelector
  readonly plan: ClosePlan
  readonly sequence: number
}

export class RevocationMarks {
  private counter = 0
  private marks: Mark[] = []
  /** The tickets of the connections that are authenticating or loading, and when each was taken. */
  private readonly pending = new Map<number, number>()
  private readonly stuckAfterMs: number
  private readonly now: () => number

  /**
   * `stuckAfterMs` is a bound on a leak and not a lifetime: a connection that dies while its document loads has no hook
   * that reports it (Hocuspocus calls `onDisconnect` only for registered connections), and its ticket would keep the marks
   * for ever. No real load takes this long.
   */
  constructor(stuckAfterMs: number, now: () => number) {
    this.stuckAfterMs = stuckAfterMs
    this.now = now
  }

  /**
   * A number for a connection that starts to authenticate, taken before it reads anything, and kept until `settle`. A mark
   * is newer than the connection when its number is greater, and then it was left after the database was read for the last
   * time that could show the connection what it has now, because a revocation is made after its change is committed.
   */
  ticket(): number {
    this.counter += 1
    this.pending.set(this.counter, this.now())
    return this.counter
  }

  /** The connection is registered, or gone, or refused: it is no longer in flight. Settling twice is harmless. */
  settle(ticket: number): void {
    this.pending.delete(ticket)
  }

  /** Called after the live connections were ended. */
  leave(selector: ConnectionSelector, plan: ClosePlan): void {
    this.counter += 1
    this.marks.push({ selector, plan, sequence: this.counter })
  }

  /** What to do with a connection that has just been registered: the plan of a mark that names it and is newer than it. */
  planFor(documentName: string, context: ConnectionContext): ClosePlan | undefined {
    this.forgetWhatNobodyNeeds()
    return this.marks.find(
      ({ sequence, selector }) => sequence > context.sequence && selects(selector, documentName, context),
    )?.plan
  }

  /** The marks that are older than every connection still in flight can reach nobody. */
  private forgetWhatNobodyNeeds(): void {
    const oldest = this.now() - this.stuckAfterMs
    for (const [ticket, taken] of this.pending) if (taken <= oldest) this.pending.delete(ticket)
    const first = Math.min(...this.pending.keys())
    this.marks = this.marks.filter(({ sequence }) => sequence > first)
  }
}

/**
 * Closes a connection that a revocation named before it was registered. The check is synchronous and comes before
 * anything is applied: the messages a client sent while it was being established are drained before `connected`, so
 * the first of them is where it has to happen, and `connected` is where it happens for a client that sent none.
 */
export function inFlightExtension(marks: RevocationMarks): Extension<ConnectionContext> {
  return {
    extensionName: 'draftroom-in-flight-revocation',

    async beforeHandleMessage({ connection, documentName }) {
      const plan = marks.planFor(documentName, connection.context)
      if (plan === undefined) return
      endConnection(connection, plan)
      // Throwing is what stops the message: the close alone would let it through.
      throw new Error('The connection was revoked while it was being established')
    },

    async connected({ connection, documentName }) {
      const plan = marks.planFor(documentName, connection.context)
      // Registered: from here the live connections are what a revocation finds.
      marks.settle(connection.context.sequence)
      if (plan !== undefined) endConnection(connection, plan)
    },

    async onDisconnect({ context }) {
      marks.settle(context.sequence)
    },
  }
}
