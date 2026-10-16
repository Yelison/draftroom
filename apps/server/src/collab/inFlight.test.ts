import { Connection, Document, Hocuspocus, type Extension } from '@hocuspocus/server'
import { describe, expect, it, vi } from 'vitest'
import type { ClosePlan } from './closeConnections.ts'
import type { ConnectionContext } from './context.ts'
import { inFlightExtension, RevocationMarks } from './inFlight.ts'

const documentName = 'doc:00000000-0000-4000-8000-000000000001'
const otherDocumentName = 'doc:00000000-0000-4000-8000-000000000002'
const revoked: ClosePlan = { code: 'access-revoked' }
const stuckAfterMs = 10 * 60 * 1000

const contextOf = (sequence: number, overrides: Partial<ConnectionContext> = {}): ConnectionContext => ({
  userId: 'person-1',
  workspaceId: 'workspace',
  role: 'editor',
  displayName: 'Eli',
  sessionId: null,
  sequence,
  ...overrides,
})

function marksWithClock() {
  const clock = { now: 0 }
  return { clock, marks: new RevocationMarks(stuckAfterMs, () => clock.now) }
}

describe('what a revocation leaves for the connections that are being established', () => {
  it('reaches a connection that took its ticket before the revocation, and none that took it after', () => {
    const { marks } = marksWithClock()
    const before = marks.ticket()
    marks.leave({ userId: 'person-1' }, revoked)
    const after = marks.ticket()

    expect(marks.planFor(documentName, contextOf(before))).toEqual(revoked)
    expect(marks.planFor(documentName, contextOf(after))).toBeUndefined()
  })

  // Rows: what the revocation names, and whether this connection (person-1, with this session, on the first document) is named.
  const selectors = [
    ['the person', { userId: 'person-1' }, true],
    ['another person', { userId: 'person-2' }, false],
    ['the document', { documentId: '00000000-0000-4000-8000-000000000001' }, true],
    ['another document', { documentId: '00000000-0000-4000-8000-000000000002' }, false],
    ['the session', { sessionId: 'hash-1' }, true],
    ['another session', { sessionId: 'hash-2' }, false],
    ['the people for whom the condition holds', { where: ({ role }: ConnectionContext) => role === 'editor' }, true],
    ['the people for whom it does not', { where: ({ role }: ConnectionContext) => role === 'owner' }, false],
  ] as const

  it.each(selectors)('that names %s is %j for this connection: %s', (_what, selector, named) => {
    const { marks } = marksWithClock()
    const ticket = marks.ticket()
    marks.leave(selector, revoked)

    const plan = marks.planFor(documentName, contextOf(ticket, { sessionId: 'hash-1' }))

    expect(plan !== undefined).toBe(named)
  })

  it('names a connection of another document only when the document is the one the revocation named', () => {
    const { marks } = marksWithClock()
    const ticket = marks.ticket()
    marks.leave({ documentId: '00000000-0000-4000-8000-000000000001' }, revoked)

    expect(marks.planFor(otherDocumentName, contextOf(ticket))).toBeUndefined()
  })

  it('lives for as long as a connection that took its ticket before it is in flight, however long that is', () => {
    const { clock, marks } = marksWithClock()
    const ticket = marks.ticket()
    marks.leave({ userId: 'person-1' }, revoked)

    // A load of a minute and a half: no clock gives a connection that is loading a deadline.
    clock.now = 90_000
    expect(marks.planFor(documentName, contextOf(ticket))).toEqual(revoked)
  })

  it('is forgotten once every connection that took its ticket before it is registered, refused or gone', () => {
    const { marks } = marksWithClock()
    const ticket = marks.ticket()
    marks.leave({ userId: 'person-1' }, revoked)
    expect(marks.planFor(documentName, contextOf(ticket))).toEqual(revoked)

    marks.settle(ticket)

    expect(marks.planFor(documentName, contextOf(ticket))).toBeUndefined()
  })

  it('is kept by the oldest connection still in flight, and forgotten when that one settles', () => {
    const { marks } = marksWithClock()
    const older = marks.ticket()
    marks.leave({ userId: 'person-1' }, revoked)
    const newer = marks.ticket()
    marks.settle(newer)

    expect(marks.planFor(documentName, contextOf(older))).toEqual(revoked)
    marks.settle(older)
    expect(marks.planFor(documentName, contextOf(older))).toBeUndefined()
  })

  it('does not keep a ticket for ever when its connection died without a hook to say so', () => {
    const { clock, marks } = marksWithClock()
    const lost = marks.ticket()
    marks.leave({ userId: 'person-1' }, revoked)

    clock.now = stuckAfterMs - 1
    expect(marks.planFor(documentName, contextOf(lost))).toEqual(revoked)
    clock.now = stuckAfterMs
    expect(marks.planFor(documentName, contextOf(lost))).toBeUndefined()
  })

  it('gives the plan of the mark that names the connection when several were left', () => {
    const { marks } = marksWithClock()
    const ticket = marks.ticket()
    marks.leave({ userId: 'person-2' }, { code: 'role-changed' })
    marks.leave({ userId: 'person-1' }, revoked)

    expect(marks.planFor(documentName, contextOf(ticket))).toEqual(revoked)
  })
})

describe('a connection that registers after a revocation', () => {
  // The hooks Hocuspocus calls for a connection, with a connection that has nowhere to send: it records what was done to it.
  function registered(sequence: number) {
    const socket = { send: vi.fn(), close: vi.fn(), readyState: 1 }
    const document = new Document(documentName)
    const connection = new Connection(
      socket,
      new Request('http://localhost'),
      document,
      'socket',
      contextOf(sequence),
      false,
    )
    return { socket, connection }
  }
  const hook = <Payload>(run: ((payload: Payload) => Promise<unknown>) | undefined) => {
    if (run === undefined) throw new Error('The extension does not have this hook')
    return run
  }
  const messageAbout = (connection: Connection<ConnectionContext>) => ({
    instance: new Hocuspocus(),
    clientsCount: 1,
    context: connection.context,
    document: connection.document,
    documentName,
    requestHeaders: new Headers(),
    requestParameters: new URLSearchParams(),
    update: new Uint8Array(),
    socketId: 'socket',
    connection,
  })
  type Before = NonNullable<Extension<ConnectionContext>['beforeHandleMessage']>
  type Connected = NonNullable<Extension<ConnectionContext>['connected']>
  type Disconnected = NonNullable<Extension<ConnectionContext>['onDisconnect']>
  const connectedAs = (connection: Connection<ConnectionContext>) => ({
    instance: new Hocuspocus(),
    request: new Request('http://localhost'),
    requestHeaders: new Headers(),
    requestParameters: new URLSearchParams(),
    socketId: 'socket',
    connectionConfig: { readOnly: false, isAuthenticated: true },
    providerVersion: null,
    context: connection.context,
    documentName,
    connection,
  })

  it('has its first message refused, and is closed with the plan, before the message is applied', async () => {
    const { marks, extension } = withExtension()
    const { socket, connection } = registered(marks.ticket())
    marks.leave({ userId: 'person-1' }, revoked)

    await expect(hook<Parameters<Before>[0]>(extension.beforeHandleMessage)(messageAbout(connection))).rejects.toThrow()

    expect(connection.readOnly).toBe(true)
    expect(socket.close).toHaveBeenCalledWith(4403, 'access-revoked')
  })

  it('has its messages go through when no mark names it', async () => {
    const { marks, extension } = withExtension()
    const { socket, connection } = registered(marks.ticket())
    marks.leave({ userId: 'person-2' }, revoked)

    await expect(
      hook<Parameters<Before>[0]>(extension.beforeHandleMessage)(messageAbout(connection)),
    ).resolves.toBeUndefined()

    expect(connection.readOnly).toBe(false)
    expect(socket.close).not.toHaveBeenCalled()
  })

  it('is no longer in flight once it is registered, so the marks that only it needed are forgotten', async () => {
    const { marks, extension } = withExtension()
    const { connection } = registered(marks.ticket())
    marks.leave({ userId: 'person-2' }, revoked)
    expect(marks.inFlight).toBe(1)

    await hook<Parameters<Connected>[0]>(extension.connected)(connectedAs(connection))

    expect(marks.inFlight).toBe(0)
  })

  it('is no longer in flight once it disconnects', async () => {
    const { marks, extension } = withExtension()
    const { connection } = registered(marks.ticket())

    await hook<Parameters<Disconnected>[0]>(extension.onDisconnect)({
      instance: new Hocuspocus(),
      clientsCount: 0,
      context: connection.context,
      document: connection.document,
      documentName,
      requestHeaders: new Headers(),
      requestParameters: new URLSearchParams(),
      socketId: 'socket',
    })

    expect(marks.inFlight).toBe(0)
  })

  it('closes a connection that a mark names as it connects, and settles it', async () => {
    const { marks, extension } = withExtension()
    const { socket, connection } = registered(marks.ticket())
    marks.leave({ userId: 'person-1' }, revoked)

    await hook<Parameters<Connected>[0]>(extension.connected)(connectedAs(connection))

    expect(socket.close).toHaveBeenCalledWith(4403, 'access-revoked')
    expect(marks.inFlight).toBe(0)
  })

  function withExtension() {
    const marks = new RevocationMarks(stuckAfterMs, () => 0)
    return { marks, extension: inFlightExtension(marks) }
  }
})
