import { describe, expect, it } from 'vitest'
import {
  createSyncModel,
  errorAction,
  isEditable,
  isStopped,
  transition,
  type SyncEffect,
  type SyncInput as SyncEvent,
  type SyncModel,
} from './syncState.ts'

/** The machine after the events, from a session that is online and has no local copy unless said. */
function play(events: readonly SyncEvent[], start?: Partial<SyncModel>) {
  let model: SyncModel = { ...createSyncModel({ online: true, hasLocalCopy: false }), ...start }
  const effects: SyncEffect[] = []
  for (const event of events) {
    const step = transition(model, event)
    model = step.model
    effects.push(...step.effects)
  }
  return { model, effects, state: model.state }
}

const disconnect: SyncEffect = { type: 'disconnect' }
const connect: SyncEffect = { type: 'connect' }
const reopen: SyncEffect = { type: 'reopen' }
const purge: SyncEffect = { type: 'purge-local-copy' }
const retryWithBackoff: SyncEffect = { type: 'retry-with-backoff' }
const start: SyncEffect = { type: 'start-ack-timer' }
const stopTimer: SyncEffect = { type: 'stop-ack-timer' }

const open: SyncEvent = { type: 'open' }
const readWrite: SyncEvent = { type: 'authenticated', scope: 'read-write' }
const handshake: SyncEvent = { type: 'handshake-completed' }
const change: SyncEvent = { type: 'local-change' }
const unsynced = (count: number): SyncEvent => ({ type: 'unsynced-changes-changed', count })
const covered: SyncEvent = { type: 'stored', coversLocalChanges: true }
const notCovered: SyncEvent = { type: 'stored', coversLocalChanges: false }
const timeout: SyncEvent = { type: 'stored-ack-timeout' }
const closed = (code: number | null, online = true): SyncEvent => ({ type: 'connection-closed', code, online })
const network = (online: boolean): SyncEvent => ({ type: 'network-changed', online })

/** An editor whose changes are all stored and acknowledged. */
const synced = [open, readWrite, handshake, unsynced(0)] as const
/** The same editor after it changed something: the server took it and has not said it stored it. */
const waiting = [...synced, change, unsynced(1), unsynced(0)] as const
/** A stalled write: the wait for the covering `stored` ran out. */
const storeTimeout = [...waiting, timeout] as const

describe('the cases the protocol requires (section 8.3)', () => {
  const cases: {
    name: string
    events: readonly SyncEvent[]
    state: string
    check?: (end: ReturnType<typeof play>) => void
  }[] = [
    {
      name: "`stored` arrives before the provider's acknowledgement",
      events: [...synced, change, unsynced(1), covered],
      state: 'synchronising',
    },
    {
      name: 'A write fails: no covering `stored` for 15 s',
      events: storeTimeout,
      state: 'error',
      check: ({ model }) => {
        expect(model.cause).toBe('store-timeout')
        expect(isEditable(model)).toBe(true)
      },
    },
    {
      name: 'a covering `stored` after the timeout, without the person pressing retry',
      events: [...storeTimeout, covered],
      state: 'synced',
    },
    {
      name: '`error` (`store-timeout`), then close `4403`',
      events: [...storeTimeout, closed(4403)],
      state: 'revoked',
      check: ({ effects }) => expect(effects).toContainEqual(purge),
    },
    {
      name: '`error` (`store-timeout`), then the network is lost',
      events: [...storeTimeout, network(false)],
      state: 'offline-local',
    },
    {
      name: '`error` (`unauthenticated`), then close `4403`',
      events: [open, { type: 'authentication-denied', reason: 'unauthenticated' }, closed(4403)],
      state: 'revoked',
    },
    {
      name: 'A second local change while the timer runs',
      events: [...synced, change, change],
      state: 'synchronising',
      check: ({ effects, model }) => {
        // Started by the first change and started over by the second, so the 15 s count from the last one.
        expect(effects).toEqual([start, start])
        expect(model.hasPending).toBe(true)
      },
    },
    {
      name: 'A deletion-only change followed by a `stored` taken before it',
      events: [...synced, change, unsynced(1), unsynced(0), notCovered],
      state: 'synchronising',
      check: ({ model }) => expect(model.hasPending).toBe(true),
    },
    { name: 'A `stored` whose snapshot contains the change', events: [...waiting, covered], state: 'synced' },
    {
      name: 'A viewer or commenter: the provider counter stays above 0',
      events: [open, { type: 'authenticated', scope: 'readonly' }, handshake, unsynced(1), unsynced(3)],
      state: 'read-only',
    },
    {
      name: 'Connection lost with pending changes, browser offline',
      events: [...waiting, closed(null, false)],
      state: 'offline-local',
      check: ({ model }) => expect(model.hasPending).toBe(true),
    },
    {
      name: 'Connection lost with pending changes, browser online',
      events: [...waiting, closed(null, true)],
      state: 'reconnecting',
      check: ({ model }) => expect(model.hasPending).toBe(true),
    },
    {
      name: 'After the reconnection: synchronising, and synced only after a covering `stored`',
      events: [...waiting, closed(null, false), network(true), readWrite, handshake, unsynced(0)],
      state: 'synchronising',
    },
    {
      name: 'After the reconnection, a covering `stored` makes it synced',
      events: [...waiting, closed(null, false), network(true), readWrite, handshake, unsynced(0), covered],
      state: 'synced',
    },
    {
      name: 'Reconnection authorised as `readonly` after offline edits',
      events: [...waiting, closed(null, true), { type: 'authenticated', scope: 'readonly' }],
      state: 'read-only',
      check: ({ effects, model }) => {
        expect(effects).toContainEqual({ type: 'discard-offline-changes' })
        expect(model.hasPending).toBe(false)
      },
    },
    {
      name: 'Close `4403`',
      events: [...synced, closed(4403)],
      state: 'revoked',
      check: ({ effects }) => expect(effects).toEqual(expect.arrayContaining([purge, disconnect])),
    },
    {
      name: '`not-found` on re-authentication of a known document',
      events: [...synced, closed(null), { type: 'authentication-denied', reason: 'not-found' }],
      state: 'revoked',
      check: ({ effects }) => expect(effects).toContainEqual(purge),
    },
    {
      name: 'Close `4413`',
      events: [...synced, closed(4413)],
      state: 'error',
      check: ({ model }) => {
        expect(model.cause).toBe('document-too-large')
        expect(errorAction(model.cause ?? 'store-timeout')).toBe('discard-and-reload')
        expect(isEditable(model)).toBe(false)
      },
    },
    {
      name: 'Close `1009`',
      events: [...synced, closed(1009)],
      state: 'error',
      check: ({ model }) => expect(model.cause).toBe('document-too-large'),
    },
    {
      name: 'Retry from `error` (`store-timeout`) while the socket is still open',
      events: [...storeTimeout, open],
      state: 'connecting',
      check: ({ effects }) => expect(effects).toContainEqual({ type: 'reopen' }),
    },
    {
      name: 'Retry from `error` (`store-timeout`) reaches `synced` after a covering `stored`',
      events: [...storeTimeout, open, readWrite, handshake, unsynced(0), covered],
      state: 'synced',
    },
    {
      name: 'In-band close (`1000`) with the socket open',
      events: [...synced, closed(1000)],
      state: 'reconnecting',
    },
  ]

  it.each(cases)('$name', ({ events, state, check }) => {
    const end = play(events)

    expect(end.state).toBe(state)
    check?.(end)
  })
})

describe('the transitions of section 8.2', () => {
  /** One row of the table: the facts it starts from, the event, and where it ends and what the caller must do. */
  const rows: {
    row: string
    from: Partial<SyncModel>
    event: SyncEvent
    to: string
    effects?: SyncEffect[]
    pending?: boolean
  }[] = [
    { row: 'open from initial', from: {}, event: open, to: 'connecting' },
    {
      row: 'open from a transient error reopens the provider',
      from: { state: 'error', cause: 'store-timeout', scope: 'read-write' },
      event: open,
      to: 'connecting',
      effects: [reopen],
    },
    {
      row: 'open from a stopped error reopens the provider',
      from: { state: 'error', cause: 'not-found' },
      event: open,
      to: 'connecting',
      effects: [reopen],
    },
    {
      row: 'open after discarding the changes of a document that is too large drops what was pending',
      from: { state: 'error', cause: 'document-too-large', hasPending: true },
      event: open,
      to: 'connecting',
      effects: [reopen],
      pending: false,
    },
    {
      row: 'open from a transient error keeps what was pending',
      from: { state: 'error', cause: 'store-timeout', hasPending: true },
      event: open,
      to: 'connecting',
      effects: [reopen],
      pending: true,
    },
    {
      row: 'open in a live state is ignored',
      from: { state: 'synced', scope: 'read-write' },
      event: open,
      to: 'synced',
    },
    {
      row: 'authenticated read-write from connecting',
      from: { state: 'connecting' },
      event: readWrite,
      to: 'synchronising',
    },
    {
      row: 'authenticated read-write from reconnecting',
      from: { state: 'reconnecting' },
      event: readWrite,
      to: 'synchronising',
    },
    {
      row: 'authenticated read-write from offline-local',
      from: { state: 'offline-local' },
      event: readWrite,
      to: 'synchronising',
    },
    {
      row: 'authenticated read-write settles into synced when the handshake is done and nothing is pending',
      from: { state: 'reconnecting', handshakeDone: true },
      event: readWrite,
      to: 'synced',
    },
    {
      row: 'authenticated readonly',
      from: { state: 'connecting' },
      event: { type: 'authenticated', scope: 'readonly' },
      to: 'read-only',
    },
    {
      row: 'authenticated in a state that does not wait for it is ignored',
      from: { state: 'synced', scope: 'read-write' },
      event: readWrite,
      to: 'synced',
    },
    {
      row: 'denied as unauthenticated',
      from: { state: 'synced', scope: 'read-write' },
      event: { type: 'authentication-denied', reason: 'unauthenticated' },
      to: 'error',
      effects: [disconnect],
    },
    {
      row: 'denied as not found after having been authorised',
      from: { state: 'reconnecting', hasBeenAuthorized: true },
      event: { type: 'authentication-denied', reason: 'not-found' },
      to: 'revoked',
      effects: [purge, disconnect],
    },
    {
      row: 'denied as not found without having been authorised',
      from: { state: 'connecting' },
      event: { type: 'authentication-denied', reason: 'not-found' },
      to: 'error',
      effects: [disconnect],
    },
    {
      row: 'denied for a fault of the server is a reconnection that purges nothing and keeps what was pending',
      from: { state: 'synced', scope: 'read-write', hasBeenAuthorized: true, hasPending: true },
      event: { type: 'authentication-denied', reason: 'unavailable' },
      to: 'reconnecting',
      effects: [retryWithBackoff],
      pending: true,
    },
    {
      row: 'denied for a fault of the server while opening for the first time keeps waiting',
      from: { state: 'connecting' },
      event: { type: 'authentication-denied', reason: 'unavailable' },
      to: 'reconnecting',
      effects: [retryWithBackoff],
    },
    {
      row: 'denied for a fault of the server does not restart a stopped error',
      from: { state: 'error', cause: 'not-found' },
      event: { type: 'authentication-denied', reason: 'unavailable' },
      to: 'error',
      effects: [],
    },
    {
      row: 'document-too-large',
      from: { state: 'synced', scope: 'read-write' },
      event: { type: 'document-too-large' },
      to: 'error',
      effects: [disconnect],
    },
    { row: 'closed with 4403', from: { state: 'connecting' }, event: closed(4403), to: 'revoked' },
    { row: 'closed with 4401', from: { state: 'synced', scope: 'read-write' }, event: closed(4401), to: 'error' },
    { row: 'closed with 4413', from: { state: 'synced', scope: 'read-write' }, event: closed(4413), to: 'error' },
    {
      row: 'closed with 1009',
      from: { state: 'synchronising', scope: 'read-write' },
      event: closed(1009),
      to: 'error',
    },
    ...(['synchronising', 'synced', 'read-only', 'reconnecting'] as const).flatMap((state) => [
      {
        row: `closed with another code, online, from ${state}`,
        from: { state },
        event: closed(1006),
        to: 'reconnecting',
      },
      {
        row: `closed with no code, offline, from ${state}`,
        from: { state },
        event: closed(null, false),
        to: 'offline-local',
        effects: [disconnect],
      },
    ]),
    {
      row: 'closed with another code, online, from a transient error',
      from: { state: 'error', cause: 'store-timeout' },
      event: closed(1006),
      to: 'reconnecting',
    },
    {
      row: 'closed with another code, offline, from a transient error',
      from: { state: 'error', cause: 'store-timeout' },
      event: closed(1006, false),
      to: 'offline-local',
      effects: [disconnect],
    },
    {
      row: 'closed with another code, online, from offline-local',
      from: { state: 'offline-local' },
      event: closed(1006),
      to: 'reconnecting',
    },
    {
      row: 'closed with another code, offline, from offline-local',
      from: { state: 'offline-local' },
      event: closed(1006, false),
      to: 'offline-local',
    },
    {
      row: 'closed with another code, online, from connecting',
      from: { state: 'connecting' },
      event: closed(1006),
      to: 'connecting',
    },
    {
      row: 'closed with another code, offline, from connecting, without a local copy',
      from: { state: 'connecting' },
      event: closed(1006, false),
      to: 'connecting',
    },
    {
      row: 'closed with another code, offline, from connecting, with a local copy',
      from: { state: 'connecting', hasLocalCopy: true },
      event: closed(1006, false),
      to: 'offline-local',
      effects: [disconnect],
    },
    ...(['synchronising', 'synced', 'read-only', 'reconnecting'] as const).map((state) => ({
      row: `the network is lost from ${state}`,
      from: { state },
      event: network(false),
      to: 'offline-local',
      effects: [disconnect],
    })),
    {
      row: 'the network is lost from a transient error',
      from: { state: 'error', cause: 'store-timeout' },
      event: network(false),
      to: 'offline-local',
      effects: [disconnect],
    },
    {
      row: 'the network is lost from connecting, without a local copy',
      from: { state: 'connecting' },
      event: network(false),
      to: 'connecting',
    },
    {
      row: 'the network is lost from connecting, with a local copy',
      from: { state: 'connecting', hasLocalCopy: true },
      event: network(false),
      to: 'offline-local',
      effects: [disconnect],
    },
    {
      row: 'the network is back from offline-local',
      from: { state: 'offline-local', online: false },
      event: network(true),
      to: 'reconnecting',
      effects: [connect],
    },
    {
      row: 'the handshake settles into synced',
      from: { state: 'synchronising', scope: 'read-write' },
      event: handshake,
      to: 'synced',
    },
    {
      row: 'the handshake keeps synchronising while something is pending',
      from: { state: 'synchronising', scope: 'read-write', hasPending: true },
      event: handshake,
      to: 'synchronising',
    },
    {
      row: 'a local change in synced',
      from: { state: 'synced', scope: 'read-write', handshakeDone: true },
      event: change,
      to: 'synchronising',
    },
    ...(['synchronising', 'reconnecting', 'offline-local'] as const).map((state) => ({
      row: `a local change in ${state} is recorded`,
      from: { state },
      event: change,
      to: state,
    })),
    {
      row: 'a local change in a transient error is recorded',
      from: { state: 'error', cause: 'store-timeout' },
      event: change,
      to: 'error',
    },
    {
      row: 'the counter above zero in synced',
      from: { state: 'synced', scope: 'read-write', handshakeDone: true },
      event: unsynced(2),
      to: 'synchronising',
    },
    {
      row: 'the counter back to zero in synchronising',
      from: { state: 'synchronising', scope: 'read-write', handshakeDone: true, unsyncedChanges: 1 },
      event: unsynced(0),
      to: 'synced',
    },
    {
      row: 'a covering stored in synchronising',
      from: { state: 'synchronising', scope: 'read-write', handshakeDone: true, hasPending: true },
      event: covered,
      to: 'synced',
    },
    {
      row: 'a covering stored in a transient error',
      from: { state: 'error', cause: 'store-timeout', scope: 'read-write', handshakeDone: true, hasPending: true },
      event: covered,
      to: 'synced',
    },
    {
      row: 'a covering stored in a transient error with the counter above zero',
      from: {
        state: 'error',
        cause: 'store-timeout',
        scope: 'read-write',
        handshakeDone: true,
        hasPending: true,
        unsyncedChanges: 1,
      },
      event: covered,
      to: 'synchronising',
    },
    {
      row: 'a stored that does not cover, in synchronising',
      from: { state: 'synchronising', scope: 'read-write', handshakeDone: true, hasPending: true },
      event: notCovered,
      to: 'synchronising',
    },
    {
      row: 'a stored that does not cover, in a transient error',
      from: { state: 'error', cause: 'store-timeout', scope: 'read-write', handshakeDone: true, hasPending: true },
      event: notCovered,
      to: 'error',
    },
    {
      row: 'the timeout in synchronising',
      from: { state: 'synchronising', scope: 'read-write', handshakeDone: true, hasPending: true },
      event: timeout,
      to: 'error',
    },
    {
      row: 'the timeout in synced is ignored',
      from: { state: 'synced', scope: 'read-write' },
      event: timeout,
      to: 'synced',
    },
  ]

  it.each(rows)('$row', ({ from, event, to, effects, pending }) => {
    const step = transition({ ...createSyncModel({ online: true, hasLocalCopy: false }), ...from }, event)

    expect(step.model.state).toBe(to)
    if (pending !== undefined) expect(step.model.hasPending).toBe(pending)
    // The timer is the subject of its own tests below; here only what the row itself asks the caller to do.
    if (effects !== undefined)
      expect(step.effects.filter((effect) => !effect.type.endsWith('ack-timer'))).toEqual(effects)
  })
})

describe('a refusal for a fault of the server', () => {
  it('leaves the editor editable and never says error, from the first answer to the recovery', () => {
    const end = play([...waiting, { type: 'authentication-denied', reason: 'unavailable' }])

    expect(end.state).toBe('reconnecting')
    expect(isEditable(end.model)).toBe(true)
    expect(end.effects).not.toContainEqual(purge)
  })

  it('ends synced only after the next connection is authorised, handshaken and covered by a stored', () => {
    const end = play([
      ...waiting,
      { type: 'authentication-denied', reason: 'unavailable' },
      readWrite,
      handshake,
      unsynced(0),
      covered,
    ])

    expect(end.state).toBe('synced')
  })
})

describe('what a state ignores', () => {
  const everyEvent: SyncEvent[] = [
    open,
    readWrite,
    handshake,
    change,
    unsynced(1),
    covered,
    timeout,
    closed(4403),
    closed(1006),
    network(false),
    { type: 'authentication-denied', reason: 'unauthenticated' },
    { type: 'document-too-large' },
  ]

  it.each(everyEvent)('revoked stays revoked on $type', (event) => {
    expect(
      transition({ ...createSyncModel({ online: true, hasLocalCopy: false }), state: 'revoked' }, event).model.state,
    ).toBe('revoked')
  })

  // `error` is not a sink: a stopped one acts on the signals that end or restart everything and on none of the others.
  const stopped = { state: 'error', cause: 'document-too-large', scope: 'read-write', handshakeDone: false } as const

  it.each([
    readWrite,
    handshake,
    change,
    unsynced(0),
    covered,
    timeout,
    closed(1006),
    closed(1006, false),
    network(false),
    network(true),
  ])('a stopped error ignores $type', (event) => {
    const model = { ...createSyncModel({ online: true, hasLocalCopy: false }), ...stopped }

    expect(isStopped(model)).toBe(true)
    expect(transition(model, event).model.state).toBe('error')
  })

  it.each([
    { event: open, to: 'connecting' },
    { event: closed(4403), to: 'revoked' },
    { event: { type: 'authentication-denied', reason: 'not-found' } satisfies SyncEvent, to: 'revoked' },
  ])('a stopped error still answers $event.type with $to', ({ event, to }) => {
    const model = { ...createSyncModel({ online: true, hasLocalCopy: false }), ...stopped, hasBeenAuthorized: true }

    expect(transition(model, event).model.state).toBe(to)
  })
})

describe('the wait for the covering `stored`', () => {
  const timerEffects = (events: readonly SyncEvent[]) => play(events).effects

  it('starts when the server has taken the changes and nothing says they are stored', () => {
    expect(timerEffects([...synced, change])).toEqual([start])
  })

  it('stops while the counter is above zero, because the server has not taken the changes yet, and starts when it returns to zero', () => {
    expect(timerEffects([...synced, change, unsynced(1)])).toEqual([start, stopTimer])
    expect(timerEffects([...synced, change, unsynced(1), unsynced(0)])).toEqual([start, stopTimer, start])
  })

  it('does not run before the handshake of the connection is done', () => {
    expect(timerEffects([open, readWrite, change])).toEqual([])
  })

  it('stops when a covering `stored` clears what is pending', () => {
    expect(timerEffects([...synced, change, covered])).toEqual([start, stopTimer])
  })

  it('stops when the connection drops', () => {
    expect(timerEffects([...synced, change, closed(null)])).toEqual([start, stopTimer])
  })

  it('stops when it runs out, which is what leads to the error', () => {
    expect(timerEffects([...synced, change, timeout])).toEqual([start, stopTimer])
  })

  it('starts again after a reconnection once the server has taken what is pending', () => {
    const effects = timerEffects([...synced, change, closed(null), readWrite, handshake, unsynced(0)])

    expect(effects).toEqual([start, stopTimer, start])
  })
})

describe('what the editor and the person are offered', () => {
  it.each([
    { state: 'connecting', editable: false },
    { state: 'synchronising', editable: true },
    { state: 'synced', editable: true },
    { state: 'offline-local', editable: true },
    { state: 'reconnecting', editable: true },
    { state: 'revoked', editable: false },
    { state: 'read-only', editable: false },
  ] as const)('$state is editable: $editable', ({ state, editable }) => {
    const scope = state === 'read-only' ? 'readonly' : 'read-write'

    expect(isEditable({ ...createSyncModel({ online: true, hasLocalCopy: false }), state, scope })).toBe(editable)
  })

  it('is not editable for a reader in a state that is editable for an editor', () => {
    expect(
      isEditable({
        ...createSyncModel({ online: true, hasLocalCopy: false }),
        state: 'reconnecting',
        scope: 'readonly',
      }),
    ).toBe(false)
  })

  it.each([
    { cause: 'store-timeout', editable: true, action: 'retry' },
    { cause: 'unauthenticated', editable: false, action: 'retry' },
    { cause: 'not-found', editable: false, action: 'retry' },
    { cause: 'document-too-large', editable: false, action: 'discard-and-reload' },
  ] as const)('an error with cause $cause: editable $editable, offers $action', ({ cause, editable, action }) => {
    const model = {
      ...createSyncModel({ online: true, hasLocalCopy: false }),
      state: 'error',
      cause,
      scope: 'read-write',
    } as const

    expect(isEditable(model)).toBe(editable)
    expect(errorAction(cause)).toBe(action)
  })
})
