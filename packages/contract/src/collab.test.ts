import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  AUTO_VERSION_IDLE_MS,
  AUTO_VERSION_MIN_INTERVAL_MS,
  CLOSE_CODES,
  LIBRARY_CLOSE_CODES,
  MAX_ANCHOR_POSITION_LENGTH,
  MAX_AWARENESS_STATE_BYTES,
  MAX_UNSENT_BYTES,
  MESSAGE_RATE_LIMIT_BURST,
  MESSAGE_RATE_LIMIT_PER_SECOND,
  RECONNECT_INITIAL_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
  RECONNECT_STABLE_MS,
  STORE_DEBOUNCE_MS,
  authDeniedReasons,
  authorizedScopes,
  MAX_DOCUMENT_STATE_BYTES,
  MAX_MESSAGE_BYTES,
  MAX_QUOTE_LENGTH,
  STORED_ACK_TIMEOUT_MS,
  STORE_MAX_DEBOUNCE_MS,
  anchorSchema,
  closeCodeNames,
  documentName,
  libraryCloseCodeNames,
  parseDocumentName,
  parseStatelessEvent,
  quoteSchema,
  serializeStatelessEvent,
  statelessEventTypes,
  syncStates,
  type StatelessEvent,
  type StatelessEventType,
} from './collab.ts'

const DOCUMENT_ID = '3f2b8c1e-9d4a-4b7e-8a15-6c0d2e9f4a71'
const THREAD_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const SNAPSHOT = 'AAEC' // any base64: the schema checks the alphabet, not Yjs
const POSITION = 'AQLi1ZvrBQA='

const protocolText = readFileSync(new URL('../../../docs/collab/protocol.md', import.meta.url), 'utf8')

describe('documentName', () => {
  it('builds the wire name from a document id and reads the id back', () => {
    expect(documentName(DOCUMENT_ID)).toBe(`doc:${DOCUMENT_ID}`)
    expect(parseDocumentName(`doc:${DOCUMENT_ID}`)).toBe(DOCUMENT_ID)
  })

  it.each([
    ['empty', ''],
    ['not an id', 'not-an-id'],
    ['uppercase spelling of a valid id', DOCUMENT_ID.toUpperCase()],
    ['trailing whitespace', `${DOCUMENT_ID} `],
    ['already prefixed', `doc:${DOCUMENT_ID}`],
    ['a path', `../${DOCUMENT_ID}`],
  ])('refuses to build a name from an invalid id: %s', (_case, id) => {
    expect(() => documentName(id)).toThrow()
  })

  it.each([
    ['empty', ''],
    ['no prefix', DOCUMENT_ID],
    ['another prefix', `document:${DOCUMENT_ID}`],
    ['uppercase prefix', `DOC:${DOCUMENT_ID}`],
    ['prefix only', 'doc:'],
    ['invalid id', 'doc:123'],
    ['uppercase id', `doc:${DOCUMENT_ID.toUpperCase()}`],
    ['nested prefix', `doc:doc:${DOCUMENT_ID}`],
  ])('returns null for a name that is not canonical: %s', (_case, name) => {
    expect(parseDocumentName(name)).toBeNull()
  })
})

describe('close codes', () => {
  it('keeps each code in the private range, unique, with the name the plan gives it', () => {
    expect(CLOSE_CODES).toEqual({
      unauthenticated: 4401,
      'access-revoked': 4403,
      'role-changed': 4409,
      'document-too-large': 4413,
      'rate-limited': 4429,
    })
    const codes = Object.values(CLOSE_CODES)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes.every((code) => code >= 4000 && code <= 4999)).toBe(true)
  })

  it('lists the names of both sets', () => {
    expect(closeCodeNames).toHaveLength(Object.keys(CLOSE_CODES).length)
    expect(libraryCloseCodeNames).toHaveLength(Object.keys(LIBRARY_CLOSE_CODES).length)
  })
})

describe('stateless events', () => {
  const examples: { [Type in StatelessEventType]: Extract<StatelessEvent, { type: Type }> } = {
    stored: { type: 'stored', snapshot: SNAPSHOT },
    'metadata-changed': { type: 'metadata-changed', title: 'Quarterly plan', revision: 3 },
    'access-changed': { type: 'access-changed' },
    'comments-changed': { type: 'comments-changed', threadId: THREAD_ID },
    'versions-changed': { type: 'versions-changed' },
    'document-archived': { type: 'document-archived' },
    'document-too-large': { type: 'document-too-large' },
  }

  it('has an example for every event type the schema declares', () => {
    expect(Object.keys(examples).sort()).toEqual([...statelessEventTypes].sort())
  })

  it.each(statelessEventTypes)('round-trips %s through its wire form', (type) => {
    const event = examples[type]
    expect(parseStatelessEvent(serializeStatelessEvent(event))).toEqual(event)
  })

  it.each([
    ['not JSON', 'stored'],
    ['not an object', '"stored"'],
    ['no type', '{}'],
    ['an unknown type', '{"type":"something-else"}'],
    ['a missing field', '{"type":"comments-changed"}'],
    ['an extra field', '{"type":"access-changed","who":"someone"}'],
    ['a stored event with no snapshot', '{"type":"stored"}'],
    ['a snapshot that is not base64', '{"type":"stored","snapshot":"not base64!"}'],
    ['an empty snapshot', '{"type":"stored","snapshot":""}'],
    ['the old state-vector field alone', '{"type":"stored","stateVector":"AAEC"}'],
    ['an empty title', '{"type":"metadata-changed","title":"","revision":1}'],
    ['a title over 200 characters', JSON.stringify({ type: 'metadata-changed', title: 'a'.repeat(201), revision: 1 })],
    ['a negative revision', '{"type":"metadata-changed","title":"A","revision":-1}'],
    ['a fractional revision', '{"type":"metadata-changed","title":"A","revision":1.5}'],
    ['a thread id that is not an id', '{"type":"comments-changed","threadId":"thread-1"}'],
  ])('ignores a malformed payload: %s', (_case, payload) => {
    expect(parseStatelessEvent(payload)).toBeNull()
  })

  it('refuses to serialise an event that does not match its schema', () => {
    const malformed = { type: 'stored', snapshot: 42 } as unknown as StatelessEvent
    expect(() => serializeStatelessEvent(malformed)).toThrow()
  })

  it('counts a title in Unicode code points, as the REST contract does', () => {
    const emoji200 = '😀'.repeat(200)
    const emoji201 = '😀'.repeat(201)
    expect(
      parseStatelessEvent(JSON.stringify({ type: 'metadata-changed', title: emoji200, revision: 0 })),
    ).not.toBeNull()
    expect(parseStatelessEvent(JSON.stringify({ type: 'metadata-changed', title: emoji201, revision: 0 }))).toBeNull()
  })
})

describe('comment anchors', () => {
  it('accepts a range of two base64 positions', () => {
    expect(anchorSchema.parse({ start: POSITION, end: POSITION })).toEqual({ start: POSITION, end: POSITION })
  })

  it.each([
    ['a missing end', { start: POSITION }],
    ['an empty start', { start: '', end: POSITION }],
    ['a start that is not base64', { start: 'not base64!', end: POSITION }],
    ['an extra field', { start: POSITION, end: POSITION, assoc: 0 }],
    ['a start that is too long', { start: 'A'.repeat(MAX_ANCHOR_POSITION_LENGTH + 4), end: POSITION }],
    ['an end that is too long', { start: POSITION, end: 'A'.repeat(MAX_ANCHOR_POSITION_LENGTH + 4) }],
  ])('rejects an anchor with %s', (_case, anchor) => {
    expect(anchorSchema.safeParse(anchor).success).toBe(false)
  })

  it('accepts a position of exactly the maximum length', () => {
    const position = 'A'.repeat(MAX_ANCHOR_POSITION_LENGTH)
    expect(anchorSchema.safeParse({ start: position, end: position }).success).toBe(true)
  })

  it('accepts a quote of 500 characters and rejects one of 501', () => {
    expect(quoteSchema.safeParse('a'.repeat(MAX_QUOTE_LENGTH)).success).toBe(true)
    expect(quoteSchema.safeParse('a'.repeat(MAX_QUOTE_LENGTH + 1)).success).toBe(false)
  })

  it('counts the quote in Unicode code points, so 500 emoji fit and 501 do not', () => {
    expect(quoteSchema.safeParse('😀'.repeat(MAX_QUOTE_LENGTH)).success).toBe(true)
    expect(quoteSchema.safeParse('😀'.repeat(MAX_QUOTE_LENGTH + 1)).success).toBe(false)
  })
})

describe('limits and timings', () => {
  // The values the protocol document tabulates; a change here is a change to the protocol.
  const pinned = {
    MAX_QUOTE_LENGTH: [MAX_QUOTE_LENGTH, 500],
    MAX_MESSAGE_BYTES: [MAX_MESSAGE_BYTES, 2 * 1024 * 1024],
    MAX_DOCUMENT_STATE_BYTES: [MAX_DOCUMENT_STATE_BYTES, 5 * 1024 * 1024],
    MAX_AWARENESS_STATE_BYTES: [MAX_AWARENESS_STATE_BYTES, 1024],
    MAX_UNSENT_BYTES: [MAX_UNSENT_BYTES, 1.5 * 1024 * 1024],
    MESSAGE_RATE_LIMIT_PER_SECOND: [MESSAGE_RATE_LIMIT_PER_SECOND, 100],
    MESSAGE_RATE_LIMIT_BURST: [MESSAGE_RATE_LIMIT_BURST, 200],
    STORE_DEBOUNCE_MS: [STORE_DEBOUNCE_MS, 1_000],
    STORE_MAX_DEBOUNCE_MS: [STORE_MAX_DEBOUNCE_MS, 5_000],
    STORED_ACK_TIMEOUT_MS: [STORED_ACK_TIMEOUT_MS, 15_000],
    AUTO_VERSION_IDLE_MS: [AUTO_VERSION_IDLE_MS, 10 * 60 * 1000],
    AUTO_VERSION_MIN_INTERVAL_MS: [AUTO_VERSION_MIN_INTERVAL_MS, 30 * 60 * 1000],
    RECONNECT_INITIAL_DELAY_MS: [RECONNECT_INITIAL_DELAY_MS, 1_000],
    RECONNECT_MAX_DELAY_MS: [RECONNECT_MAX_DELAY_MS, 30_000],
    RECONNECT_STABLE_MS: [RECONNECT_STABLE_MS, 60_000],
  } as const

  it.each(Object.entries(pinned))('fixes %s at the value the protocol states', (_name, [actual, expected]) => {
    expect(actual).toBe(expected)
  })

  it('waits for a stored event longer than the longest write delay, and writes sooner than that delay allows', () => {
    expect(STORE_DEBOUNCE_MS).toBeLessThan(STORE_MAX_DEBOUNCE_MS)
    expect(STORED_ACK_TIMEOUT_MS).toBeGreaterThan(STORE_MAX_DEBOUNCE_MS)
  })

  it('keeps the unsent budget below the message limit and below the document limit', () => {
    expect(MAX_UNSENT_BYTES).toBeLessThan(MAX_MESSAGE_BYTES)
    expect(MAX_MESSAGE_BYTES).toBeLessThan(MAX_DOCUMENT_STATE_BYTES)
  })

  it('backs off from a short first delay to a longer cap, and calls a connection stable after the cap', () => {
    expect(RECONNECT_INITIAL_DELAY_MS).toBeLessThan(RECONNECT_MAX_DELAY_MS)
    expect(RECONNECT_STABLE_MS).toBeGreaterThan(RECONNECT_MAX_DELAY_MS)
  })

  it('refuses an authentication with exactly the two reasons that cannot be used to probe ids', () => {
    expect(authDeniedReasons).toEqual(['unauthenticated', 'not-found'])
    expect(authorizedScopes).toEqual(['read-write', 'readonly'])
  })
})

describe('docs/collab/protocol.md', () => {
  // Each name has to be in the table of its own section, not merely somewhere in the document.
  const section = (heading: string) => {
    const start = protocolText.indexOf(`\n${heading}`)
    const next = protocolText.indexOf('\n#', start + heading.length)
    expect(start, `section "${heading}" exists`).toBeGreaterThan(-1)
    return protocolText.slice(start, next)
  }

  it.each(closeCodeNames.map((name) => [name, CLOSE_CODES[name]] as const))(
    'documents the close code %s (%i) in the table of codes the server sends',
    (name, code) => {
      expect(section('### 6.2')).toContain(`| \`${code}\` | \`${name}\``)
    },
  )

  it.each(libraryCloseCodeNames.map((name) => [name, LIBRARY_CLOSE_CODES[name]] as const))(
    'documents the library close code %s (%i) in the table of codes the transport emits',
    (name, code) => {
      expect(section('### 6.4')).toContain(`| \`${code}\` | \`${name}\``)
    },
  )

  it.each(statelessEventTypes)('documents the stateless event %s in the table of events', (type) => {
    expect(section('## 9.')).toContain(`| \`${type}\``)
  })

  it.each(syncStates)('documents the sync state %s in the table of states', (state) => {
    expect(section('### 8.1')).toContain(`| \`${state}\``)
  })

  it.each([
    'MAX_MESSAGE_BYTES',
    'MAX_DOCUMENT_STATE_BYTES',
    'MAX_AWARENESS_STATE_BYTES',
    'MAX_UNSENT_BYTES',
    'MESSAGE_RATE_LIMIT_PER_SECOND',
    'MESSAGE_RATE_LIMIT_BURST',
    'STORE_DEBOUNCE_MS',
    'STORE_MAX_DEBOUNCE_MS',
    'STORED_ACK_TIMEOUT_MS',
    'AUTO_VERSION_IDLE_MS',
    'AUTO_VERSION_MIN_INTERVAL_MS',
    'RECONNECT_INITIAL_DELAY_MS',
    'RECONNECT_MAX_DELAY_MS',
    'RECONNECT_STABLE_MS',
    'MAX_ANCHOR_POSITION_LENGTH',
    'MAX_QUOTE_LENGTH',
  ])('names the constant %s', (name) => {
    expect(protocolText).toContain(`\`${name}\``)
  })

  it.each(authDeniedReasons)('documents the authentication refusal reason %s in §3.3', (reason) => {
    expect(section('### 3.3')).toContain(`\`${reason}\``)
  })
})
