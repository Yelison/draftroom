import { Document, Hocuspocus, type Extension } from '@hocuspocus/server'
import { afterAll, describe, expect, it } from 'vitest'
import { createDatabase } from '../db/database.ts'
import { authenticateExtension } from './authenticate.ts'
import type { ConnectionContext } from './context.ts'
import { DurabilityRegistry } from './durability.ts'
import { RevocationMarks } from './inFlight.ts'
import { persistenceExtension } from './persistence.ts'
import { StoreRetry } from './storeRetry.ts'

// A connection is in flight from the moment it starts to authenticate, and a failure on the way must not leave it so: the
// marks of a revocation live for as long as one is, so a ticket that nobody settles keeps them for ever.

const documentName = 'doc:00000000-0000-4000-8000-000000000001'
const silent = { info: () => undefined, warn: () => undefined, error: () => undefined }
const database = createDatabase('postgres://nobody@127.0.0.1:1/none')
afterAll(() => database.destroy())

const hook = <Payload>(
  run: ((payload: Payload) => Promise<unknown>) | undefined,
): ((payload: Payload) => Promise<unknown>) => {
  if (run === undefined) throw new Error('The extension does not have this hook')
  return run
}

/** What a connection holds before it is authenticated: nothing of its own yet. */
const blank: ConnectionContext = {
  userId: '',
  workspaceId: '',
  role: 'viewer',
  displayName: '',
  sessionId: null,
  sequence: 0,
}

type Authenticate = NonNullable<Extension<ConnectionContext>['onAuthenticate']>

const authenticating = {
  token: '',
  instance: new Hocuspocus(),
  request: new Request('http://localhost'),
  requestHeaders: new Headers(),
  requestParameters: new URLSearchParams(),
  socketId: 'socket',
  connectionConfig: { readOnly: false, isAuthenticated: false },
  providerVersion: null,
  context: blank,
  documentName,
}

describe('the ticket of a connection that fails on the way', () => {
  it.each([
    ['is refused', () => Promise.resolve({ status: 'unauthenticated' as const }), 'unauthenticated'],
    ['fails for a reason of the server', () => Promise.reject(new Error('The session store is down')), 'unavailable'],
  ])('is settled when the authentication %s', async (_how, authenticate, reason) => {
    const marks = new RevocationMarks(600_000, () => 0)
    const extension = authenticateExtension({
      database,
      authProvider: { authenticate },
      sessionSecret: 'a-secret-that-is-long-enough-for-a-hash',
      log: silent,
      marks,
    })

    await expect(hook<Parameters<Authenticate>[0]>(extension.onAuthenticate)(authenticating)).rejects.toEqual({
      reason,
    })

    expect(marks.inFlight).toBe(0)
  })

  it('is settled when the document does not load', async () => {
    const marks = new RevocationMarks(600_000, () => 0)
    const sequence = marks.ticket()
    const extension = persistenceExtension({
      store: { load: () => Promise.reject(new Error('The database is down')), save: () => Promise.resolve() },
      durability: new DurabilityRegistry(),
      retry: new StoreRetry([1], silent),
      marks,
      excerpts: { schedule: () => undefined },
      log: silent,
    })
    const context: ConnectionContext = {
      userId: 'u',
      workspaceId: 'w',
      role: 'editor',
      displayName: 'E',
      sessionId: null,
      sequence,
    }

    await expect(
      hook<Parameters<NonNullable<Extension<ConnectionContext>['onLoadDocument']>>[0]>(extension.onLoadDocument)({
        instance: new Hocuspocus(),
        context,
        document: new Document(documentName),
        documentName,
        requestHeaders: new Headers(),
        requestParameters: new URLSearchParams(),
        socketId: 'socket',
        connectionConfig: { readOnly: false, isAuthenticated: true },
      }),
    ).rejects.toThrow('The database is down')

    expect(marks.inFlight).toBe(0)
  })
})
