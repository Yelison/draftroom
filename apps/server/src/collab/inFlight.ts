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
  /** How the connections it names end; none for a mark that only takes their right to write. */
  readonly plan?: ClosePlan
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

  /** How many connections are authenticating or loading: the tickets that keep the marks alive. */
  get inFlight(): number {
    return this.pending.size
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

  /** Called after the live connections lost their right to write: the ones in flight lose it as they are registered. */
  freeze(selector: ConnectionSelector): void {
    this.counter += 1
    this.marks.push({ selector, sequence: this.counter })
  }

  /** What to do with a connection that has just been registered: the plan of a mark that names it and is newer than it. */
  planFor(documentName: string, context: ConnectionContext): ClosePlan | undefined {
    this.forgetWhatNobodyNeeds()
    return this.marks.find(
      ({ sequence, selector, plan }) =>
        plan !== undefined && sequence > context.sequence && selects(selector, documentName, context),
    )?.plan
  }

  /** Whether a mark that names the connection and is newer than it has taken its right to write, or is about to end it. */
  frozen(documentName: string, context: ConnectionContext): boolean {
    this.forgetWhatNobodyNeeds()
    return this.marks.some(
      ({ sequence, selector }) => sequence > context.sequence && selects(selector, documentName, context),
    )
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
      if (plan === undefined) {
        // Not ended yet, perhaps never: but it may not write, and this is before the message is applied.
        if (marks.frozen(documentName, connection.context)) connection.readOnly = true
        return
      }
      endConnection(connection, plan)
      // Throwing is what stops the message: the close alone would let it through.
      throw new Error('The connection was revoked while it was being established')
    },

    async connected({ connection, documentName }) {
      // Asked before the connection is settled: once nothing is in flight the marks are forgotten, this one's with them.
      const plan = marks.planFor(documentName, connection.context)
      const frozen = marks.frozen(documentName, connection.context)
      // Registered: from here the live connections are what a revocation finds.
      marks.settle(connection.context.sequence)
      if (plan !== undefined) endConnection(connection, plan)
      else if (frozen) connection.readOnly = true
    },

    async onDisconnect({ context }) {
      marks.settle(context.sequence)
    },
  }
}
