import { parseStatelessEvent } from '@draftroom/contract/collab'
import { Connection, Document, Hocuspocus, type Extension } from '@hocuspocus/server'
import { describe, expect, it, vi } from 'vitest'
import type { ConnectionContext } from './context.ts'
import { DurabilityRegistry, snapshotOf } from './durability.ts'
import { durableAckExtension } from './durableAck.ts'

// What the server tells clients about storage (protocol §7): the snapshot of what is in the database, to writers only, and
// a document that holds changes the database does not have is not let go.

const documentName = 'doc:00000000-0000-4000-8000-000000000001'
/** The snapshot of an empty document, which is what a document that was just created has stored. */
const loadedSnapshot = 'AAA='
const context: ConnectionContext = {
  userId: 'u',
  workspaceId: 'w',
  role: 'editor',
  displayName: 'Eli',
  sessionId: null,
  sequence: 1,
}

/** A connection with nowhere to send: it records what it was sent. */
function connectionTo(document: Document, readOnly: boolean): Connection<ConnectionContext> {
  const socket = { send: vi.fn(), close: vi.fn(), readyState: 1 }
  return new Connection(socket, new Request('http://localhost'), document, 'socket', context, readOnly)
}

function setUp() {
  const durability = new DurabilityRegistry()
  const errors: object[] = []
  const log = { info: () => undefined, warn: () => undefined, error: (details: object) => errors.push(details) }
  const extension = durableAckExtension({ durability, log })
  const document = new Document(documentName)
  const durable = durability.track(document, documentName, { snapshot: loadedSnapshot, size: 1 })
  const instance = new Hocuspocus()
  return { durability, durable, errors, extension, document, instance }
}

const hook = <Payload>(
  run: ((payload: Payload) => Promise<unknown>) | undefined,
): ((payload: Payload) => Promise<unknown>) => {
  if (run === undefined) throw new Error('The extension does not have this hook')
  return run
}

describe('after a store', () => {
  it('tells the writers the snapshot the write captured, and never one taken since', async () => {
    const { durable, extension, document, instance } = setUp()
    document.getText('t').insert(0, 'written')
    const write = durable.capture(document)
    durable.commit(write)
    // A change applied after the capture, while the write was in flight: acknowledged to its author, and not stored.
    document.getText('t').insert(0, 'later ')
    const broadcast = vi.spyOn(document, 'broadcastStateless').mockReturnValue(undefined)

    await hook(extension.afterStoreDocument)({
      instance,
      clientsCount: 0,
      document,
      documentName,
      lastContext: context,
      lastTransactionOrigin: {},
    })

    const [payload] = broadcast.mock.calls[0] ?? []
    expect(parseStatelessEvent(payload ?? '')).toEqual({ type: 'stored', snapshot: write.snapshot })
    expect(write.snapshot).not.toBe(snapshotOf(document))
  })

  it('sends it to connections that can write, and to no connection that only reads', async () => {
    const { durable, extension, document, instance } = setUp()
    durable.commit(durable.capture(document))
    const writer = connectionTo(document, false)
    const reader = connectionTo(document, true)
    const broadcast = vi.spyOn(document, 'broadcastStateless').mockReturnValue(undefined)

    await hook(extension.afterStoreDocument)({
      instance,
      clientsCount: 2,
      document,
      documentName,
      lastContext: context,
      lastTransactionOrigin: {},
    })

    const accepts = broadcast.mock.calls[0]?.[1]
    expect([accepts?.(writer), accepts?.(reader)]).toEqual([true, false])
  })
})

describe('when a client connects', () => {
  it('a writer is told what is stored now, from the slot', async () => {
    const { extension, document, instance } = setUp()
    const writer = connectionTo(document, false)
    const send = vi.spyOn(writer, 'sendStateless').mockReturnValue(undefined)

    await hook(extension.connected)({
      instance,
      request: new Request('http://localhost'),
      requestHeaders: new Headers(),
      requestParameters: new URLSearchParams(),
      socketId: 'socket',
      connectionConfig: { readOnly: false, isAuthenticated: true },
      providerVersion: null,
      context,
      documentName,
      connection: writer,
    })

    expect(parseStatelessEvent(send.mock.calls[0]?.[0] ?? '')).toEqual({ type: 'stored', snapshot: loadedSnapshot })
  })

  it('a reader is told nothing: it has no changes to be acknowledged', async () => {
    const { extension, document, instance } = setUp()
    const reader = connectionTo(document, true)
    const send = vi.spyOn(reader, 'sendStateless').mockReturnValue(undefined)

    await hook(extension.connected)({
      instance,
      request: new Request('http://localhost'),
      requestHeaders: new Headers(),
      requestParameters: new URLSearchParams(),
      socketId: 'socket',
      connectionConfig: { readOnly: true, isAuthenticated: true },
      providerVersion: null,
      context,
      documentName,
      connection: reader,
    })

    expect(send).not.toHaveBeenCalled()
  })
})

describe('before a document is unloaded', () => {
  const unloading = (instance: Hocuspocus, document: Document) => ({ instance, documentName, document })

  it('lets it go when everything it holds is stored', async () => {
    const { extension, document, instance } = setUp()

    await expect(
      hook<Parameters<NonNullable<Extension['beforeUnloadDocument']>>[0]>(extension.beforeUnloadDocument)(
        unloading(instance, document),
      ),
    ).resolves.toBeUndefined()
  })

  it('keeps it when it holds changes the database does not have', async () => {
    const { durable, extension, document, instance } = setUp()
    durable.noteChange()

    await expect(
      hook<Parameters<NonNullable<Extension['beforeUnloadDocument']>>[0]>(extension.beforeUnloadDocument)(
        unloading(instance, document),
      ),
    ).rejects.toBeDefined()
  })

  it('lets it go, and says which document it lost changes of, when the server is shutting down', async () => {
    const { durability, durable, errors, extension, document, instance } = setUp()
    durable.noteChange()
    durability.beginShutdown()

    await expect(
      hook<Parameters<NonNullable<Extension['beforeUnloadDocument']>>[0]>(extension.beforeUnloadDocument)(
        unloading(instance, document),
      ),
    ).resolves.toBeUndefined()

    expect(errors).toEqual([{ documentName }])
  })

  it('forgets what it knew of a document once it is unloaded', async () => {
    const { durability, extension, instance } = setUp()

    await hook<{ instance: Hocuspocus; documentName: string }>(extension.afterUnloadDocument)({
      instance,
      documentName,
    })

    expect(durability.get(documentName)).toBeUndefined()
  })
})
