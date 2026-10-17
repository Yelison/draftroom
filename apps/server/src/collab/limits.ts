import {
  MAX_DOCUMENT_STATE_BYTES,
  MESSAGE_RATE_LIMIT_BURST,
  MESSAGE_RATE_LIMIT_PER_SECOND,
  type StatelessEvent,
} from '@draftroom/contract/collab'
import type { Connection, Extension } from '@hocuspocus/server'
import * as Y from 'yjs'
import { createTokenBucket, type TokenBucket } from '../rate-limit/tokenBucket.ts'
import { endConnection } from './closeConnections.ts'
import type { ConnectionContext } from './context.ts'
import type { DurabilityRegistry } from './durability.ts'

// The limits that are the server's to enforce (protocol §5.1 and §5.2). The message size is enforced by `ws` itself, and
// the buffer before authentication by Hocuspocus; both are configured in `server.ts`.

/** The Sync sub-messages that carry an update, as numbered by y-protocols; SyncStep1 (0) carries a state vector. */
const SYNC_STEP_2 = 1
const SYNC_UPDATE = 2

export interface WriteAttempt {
  readonly document: Y.Doc
  /** The sync sub-message type. */
  readonly type: number
  readonly payload: Uint8Array
  /** The size of the state the last store wrote, or the loaded one. */
  readonly storedSize: number
  readonly readOnly: boolean
}

/**
 * Whether a message must be refused because the document is over its size limit (§5.2). It acts only on a write that
 * adds content to a document that is already too large; reading, the handshake's SyncStep2 that adds nothing, and
 * deletions all pass, because they are the way down from an oversized document.
 */
export function refusesOversizedWrite({ document, type, payload, storedSize, readOnly }: WriteAttempt): boolean {
  if (type !== SYNC_STEP_2 && type !== SYNC_UPDATE) return false
  // A read-only connection never writes, so it is exempt: Hocuspocus does not apply what it sends.
  if (readOnly || storedSize <= MAX_DOCUMENT_STATE_BYTES) return false
  if (Y.snapshotContainsUpdate(Y.snapshot(document), payload)) return false
  // A pure deletion has no structs (F16).
  return Y.parseUpdateMeta(payload).to.size > 0
}

const tooLarge: StatelessEvent = { type: 'document-too-large' }

export interface LimitsOptions {
  readonly durability: DurabilityRegistry
  readonly now: () => number
}

/** The rate limit and the size limit of a document, as hooks. */
export function limitsExtension({ durability, now }: LimitsOptions): Extension<ConnectionContext> {
  const buckets = new WeakMap<Connection, TokenBucket>()
  return {
    extensionName: 'draftroom-limits',

    // One token per message of any type, awareness included (§5.1). When the bucket is empty the socket is closed and
    // the message is not processed: throwing is what stops it, because the close alone would let it through.
    async beforeHandleMessage({ connection }) {
      let bucket = buckets.get(connection)
      if (bucket === undefined) {
        bucket = createTokenBucket({
          perSecond: MESSAGE_RATE_LIMIT_PER_SECOND,
          burst: MESSAGE_RATE_LIMIT_BURST,
          now,
        })
        buckets.set(connection, bucket)
      }
      if (bucket.take()) return
      endConnection(connection, { code: 'rate-limited' })
      throw new Error('The connection exceeded the message rate limit')
    },

    // Closing, rather than dropping the message silently, is deliberate: a dropped update would be acknowledged with
    // neither a success nor an error and would leave the client synchronising for ever.
    async beforeSync({ connection, document, documentName, type, payload }) {
      const storedSize = durability.get(documentName)?.lastStored.size ?? 0
      if (!refusesOversizedWrite({ document, type, payload, storedSize, readOnly: connection.readOnly })) return
      endConnection(connection, { code: 'document-too-large', event: tooLarge })
      throw new Error('The document is over its size limit and the message adds content')
    },
  }
}
