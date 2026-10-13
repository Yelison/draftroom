/**
 * Collaboration protocol contract (docs/collab/protocol.md is the normative text).
 *
 * Shared by the collaboration server (T2.1) and the client sync layer (T2.2). It holds the wire-level vocabulary only:
 * names, codes, limits, message schemas and the types of the client sync-state machine. No behaviour lives here.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------------------------------------------------
// Document name on the wire (protocol.md §2)
// ---------------------------------------------------------------------------------------------------------------------

export const DOCUMENT_NAME_PREFIX = 'doc:'

// Lowercase only: Hocuspocus keys its in-memory documents by name, so two spellings of one id would become two
// documents that diverge. The shape is the generic 8-4-4-4-12 form rather than a UUID version check, because the
// demo seed uses hand-written ids.
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const idSchema = z.string().regex(ID_PATTERN)

/** The name a document has in the collaboration protocol. Throws for an id that is not canonical. */
export function documentName(documentId: string): string {
  return `${DOCUMENT_NAME_PREFIX}${idSchema.parse(documentId)}`
}

/** The inverse of {@link documentName}: the document id, or `null` for anything that is not a canonical name. */
export function parseDocumentName(name: string): string | null {
  if (!name.startsWith(DOCUMENT_NAME_PREFIX)) return null
  const parsed = idSchema.safeParse(name.slice(DOCUMENT_NAME_PREFIX.length))
  return parsed.success ? parsed.data : null
}

// ---------------------------------------------------------------------------------------------------------------------
// Close codes and authentication refusals (protocol.md §3.3, §3.4)
// ---------------------------------------------------------------------------------------------------------------------

/** Codes the Draftroom server sends when it closes a WebSocket. The reason text of the close frame is the name. */
export const CLOSE_CODES = {
  unauthenticated: 4401,
  'access-revoked': 4403,
  'role-changed': 4409,
  'document-too-large': 4413,
  'rate-limited': 4429,
} as const

export type CloseCodeName = keyof typeof CLOSE_CODES
export type CloseCode = (typeof CLOSE_CODES)[CloseCodeName]

export const closeCodeNames = Object.keys(CLOSE_CODES) as CloseCodeName[]

/** Codes the transport and Hocuspocus 4.7.1 emit on their own; the client must handle them too. */
export const LIBRARY_CLOSE_CODES = {
  'message-too-big': 1009,
  'connection-reset': 4205,
  'connection-timeout': 4408,
} as const

export type LibraryCloseCodeName = keyof typeof LIBRARY_CLOSE_CODES

export const libraryCloseCodeNames = Object.keys(LIBRARY_CLOSE_CODES) as LibraryCloseCodeName[]

/**
 * Reasons sent in the `PermissionDenied` authentication message. There is deliberately no "forbidden": a document the
 * person cannot read looks exactly like one that does not exist, so ids cannot be probed.
 */
export const authDeniedReasons = ['unauthenticated', 'not-found'] as const

export type AuthDeniedReason = (typeof authDeniedReasons)[number]

/** What `HocuspocusProvider.authorizedScope` reports; `readonly` is what `connectionConfig.readOnly = true` produces. */
export const authorizedScopes = ['read-write', 'readonly'] as const

export type AuthorizedScope = (typeof authorizedScopes)[number]

// ---------------------------------------------------------------------------------------------------------------------
// Limits (protocol.md §3.5)
// ---------------------------------------------------------------------------------------------------------------------

/** `websocketOptions.maxPayload`: the transport refuses a larger message and closes with 1009. */
export const MAX_MESSAGE_BYTES = 2 * 1024 * 1024

/** Above this size of stored state the server refuses further writes to the document. */
export const MAX_DOCUMENT_STATE_BYTES = 5 * 1024 * 1024

/** A presence state larger than this (JSON bytes) is dropped by the awareness guard. */
export const MAX_AWARENESS_STATE_BYTES = 1024

/** Per-connection token bucket: refilled at this rate, holding at most the burst. Exceeding it closes with 4429. */
export const MESSAGE_RATE_LIMIT_PER_SECOND = 100
export const MESSAGE_RATE_LIMIT_BURST = 200

// ---------------------------------------------------------------------------------------------------------------------
// Durability (protocol.md §4)
// ---------------------------------------------------------------------------------------------------------------------

/** Hocuspocus `debounce` and `maxDebounce`: how long after a change the server writes the document. */
export const STORE_DEBOUNCE_MS = 1_000
export const STORE_MAX_DEBOUNCE_MS = 5_000

/**
 * How long a client waits, once the server acknowledged a change in memory, for a `stored` event that covers it before
 * it shows `error`. Three times the longest write delay, so one slow write does not raise a false error.
 */
export const STORED_ACK_TIMEOUT_MS = 3 * STORE_MAX_DEBOUNCE_MS

// ---------------------------------------------------------------------------------------------------------------------
// Automatic versions (protocol.md §8)
// ---------------------------------------------------------------------------------------------------------------------

export const AUTO_VERSION_IDLE_MS = 10 * 60 * 1000
export const AUTO_VERSION_MIN_INTERVAL_MS = 30 * 60 * 1000

// ---------------------------------------------------------------------------------------------------------------------
// Comment anchors (protocol.md §7)
// ---------------------------------------------------------------------------------------------------------------------

export const MAX_QUOTE_LENGTH = 500

/**
 * A base64 `Y.encodeRelativePosition` is a handful of varints and the root type name, about 40 bytes. 128 base64
 * characters (96 bytes) leave room and still refuse an attempt to store arbitrary data in an anchor.
 */
export const MAX_ANCHOR_POSITION_LENGTH = 128

/** Length in Unicode code points, the unit JSON Schema `maxLength` (and so the REST contract) counts in. */
export function codePointLength(text: string): number {
  let length = 0
  for (const _ of text) length += 1
  return length
}

const anchorPositionSchema = z.base64().min(1).max(MAX_ANCHOR_POSITION_LENGTH)

/** Both ends of a commented range: base64 of `Y.encodeRelativePosition`. */
export const anchorSchema = z.strictObject({
  start: anchorPositionSchema,
  end: anchorPositionSchema,
})

export type Anchor = z.infer<typeof anchorSchema>

/** The text the range covered when the thread was created; shown when the thread is orphaned. */
export const quoteSchema = z
  .string()
  .refine((quote) => codePointLength(quote) <= MAX_QUOTE_LENGTH, `at most ${MAX_QUOTE_LENGTH} characters`)

// ---------------------------------------------------------------------------------------------------------------------
// Stateless events, server to client (protocol.md §5)
// ---------------------------------------------------------------------------------------------------------------------

export const MAX_TITLE_LENGTH = 200

const titleSchema = z
  .string()
  .min(1)
  .refine((title) => codePointLength(title) <= MAX_TITLE_LENGTH, `at most ${MAX_TITLE_LENGTH} characters`)

export const statelessEventSchema = z.discriminatedUnion('type', [
  /** A write to the database finished; `snapshot` is `Y.encodeSnapshot` of exactly the state that was written. */
  z.strictObject({ type: z.literal('stored'), snapshot: z.base64().min(1) }),
  z.strictObject({ type: z.literal('metadata-changed'), title: titleSchema, revision: z.int().nonnegative() }),
  z.strictObject({ type: z.literal('access-changed') }),
  z.strictObject({ type: z.literal('comments-changed'), threadId: idSchema }),
  z.strictObject({ type: z.literal('versions-changed') }),
  z.strictObject({ type: z.literal('document-archived') }),
  z.strictObject({ type: z.literal('document-too-large') }),
])

export type StatelessEvent = z.infer<typeof statelessEventSchema>
export type StatelessEventType = StatelessEvent['type']

export const statelessEventTypes: StatelessEventType[] = statelessEventSchema.options.map(
  (option) => option.shape.type.value,
)

export function serializeStatelessEvent(event: StatelessEvent): string {
  return JSON.stringify(statelessEventSchema.parse(event))
}

/** The event in a stateless payload, or `null` for anything malformed or unknown: a client ignores those. */
export function parseStatelessEvent(payload: string): StatelessEvent | null {
  let json: unknown
  try {
    json = JSON.parse(payload)
  } catch {
    return null
  }
  const parsed = statelessEventSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

// ---------------------------------------------------------------------------------------------------------------------
// Client sync-state machine: types only; T2.2 implements it (protocol.md §6)
// ---------------------------------------------------------------------------------------------------------------------

export const syncStates = [
  'connecting',
  'synchronising',
  'synced',
  'offline-local',
  'reconnecting',
  'error',
  'revoked',
  'read-only',
] as const

export type SyncState = (typeof syncStates)[number]

/** Why the machine is in `error`; each cause has its own message and the retry is offered for every one. */
export type SyncErrorCause = 'store-timeout' | 'document-too-large' | 'unauthenticated' | 'not-found'

export type SyncEvent =
  /** The editor opens the document, or the person retries from `error`. */
  | { type: 'open' }
  | { type: 'authenticated'; scope: AuthorizedScope }
  | { type: 'authentication-denied'; reason: AuthDeniedReason }
  /** The provider's `synced` event: the server's SyncStep2 arrived. */
  | { type: 'handshake-completed' }
  /** A change made by this client, including everything loaded from the local copy at open. */
  | { type: 'local-change' }
  /** The provider's `unsyncedChanges` event, with its counter. */
  | { type: 'unsynced-changes-changed'; count: number }
  /** A `stored` event arrived; `coversLocalChanges` is the result of the rule in protocol.md §4.3. */
  | { type: 'stored'; coversLocalChanges: boolean }
  | { type: 'stored-ack-timeout' }
  /** The `document-too-large` stateless event. */
  | { type: 'document-too-large' }
  /** The WebSocket closed; `code` is the close frame's code, or `null` when the browser reports none. */
  | { type: 'connection-closed'; code: number | null; online: boolean }
  | { type: 'network-changed'; online: boolean }
