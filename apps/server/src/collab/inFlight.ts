import type { Extension } from '@hocuspocus/server'
import { endConnection, selects, type ClosePlan, type ConnectionSelector } from './closeConnections.ts'
import type { ConnectionContext } from './context.ts'

// A revocation looks for the connections a document has, and a connection that is still being established has none yet:
// `onAuthenticate` has read the person's role, but the connection is registered only after the document has loaded (and
// after the hooks that follow), which can take a while. A revocation that falls in that gap would find nothing, and the
// connection would be established afterwards with the role the person no longer has. The same holds for a change of role
// and for the end of a session. So each revocation also leaves a mark, and a connection that registers afterwards is
// closed by the mark if the mark is newer than its authentication.

interface Mark {
  readonly selector: ConnectionSelector
  readonly plan: ClosePlan
  readonly sequence: number
  readonly expiresAt: number
}

export class RevocationMarks {
  private counter = 0
  private marks: Mark[] = []
  private readonly lifetimeMs: number
  private readonly now: () => number

  /**
   * `lifetimeMs` is how long a connection can stay unregistered: Hocuspocus closes one that has not authenticated within
   * its `timeout`, so a mark older than that has nobody left to reach.
   */
  constructor(lifetimeMs: number, now: () => number) {
    this.lifetimeMs = lifetimeMs
    this.now = now
  }

  /**
   * A number for a connection that starts to authenticate, taken before it reads anything. A mark is newer than the
   * connection when its number is greater, and then it was left after the database was read for the last time that could
   * show the connection what it has now, because a revocation is made after its change is committed.
   */
  ticket(): number {
    this.counter += 1
    return this.counter
  }

  /** Called after the live connections were ended. */
  leave(selector: ConnectionSelector, plan: ClosePlan): void {
    this.counter += 1
    this.marks.push({ selector, plan, sequence: this.counter, expiresAt: this.now() + this.lifetimeMs })
  }

  /** What to do with a connection that has just been registered: the plan of a mark that names it and is newer than it. */
  planFor(documentName: string, context: ConnectionContext): ClosePlan | undefined {
    const now = this.now()
    this.marks = this.marks.filter(({ expiresAt }) => expiresAt > now)
    return this.marks.find(
      ({ sequence, selector }) => sequence > context.sequence && selects(selector, documentName, context),
    )?.plan
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
      if (plan !== undefined) endConnection(connection, plan)
    },
  }
}
