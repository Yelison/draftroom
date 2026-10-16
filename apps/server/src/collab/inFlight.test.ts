import { Connection, Document, Hocuspocus, type Extension } from '@hocuspocus/server'
import { describe, expect, it, vi } from 'vitest'
import type { ClosePlan } from './closeConnections.ts'
import type { ConnectionContext } from './context.ts'
import { inFlightExtension, RevocationMarks } from './inFlight.ts'

const documentName = 'doc:00000000-0000-4000-8000-000000000001'
const otherDocumentName = 'doc:00000000-0000-4000-8000-000000000002'
const revoked: ClosePlan = { code: 'access-revoked' }
const lifetimeMs = 30_000

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
  return { clock, marks: new RevocationMarks(lifetimeMs, () => clock.now) }
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

  it('is forgotten once no connection can still be establishing, which is after the time Hocuspocus allows it', () => {
    const { clock, marks } = marksWithClock()
    const ticket = marks.ticket()
    marks.leave({ userId: 'person-1' }, revoked)

    clock.now = lifetimeMs - 1
    expect(marks.planFor(documentName, contextOf(ticket))).toEqual(revoked)
    clock.now = lifetimeMs
    expect(marks.planFor(documentName, contextOf(ticket))).toBeUndefined()
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

  function withExtension() {
    const marks = new RevocationMarks(lifetimeMs, () => 0)
    return { marks, extension: inFlightExtension(marks) }
  }
})
