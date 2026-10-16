import * as Y from 'yjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UNSTORED_WAIT_MS, leaveAccount, type LeaveAccountOutcome } from './leaveAccount.ts'
import { copiesOf, copyName, openLocalCopy, type LocalCopy } from './offlineCache.ts'
import { withFreshIndexedDb } from './testing/fakeIndexedDb.ts'
import {
  advance,
  createWorld,
  documentId,
  editor,
  fakeNetwork,
  typeInto,
  wireName,
  workspaceId,
  type World,
} from './testing/sessionWorld.ts'

// Leaving an account is run against the storage of the browser and, where it matters, against a session that is storing
// what the person wrote. The clocks are fake: the wait of a few seconds is a number the test moves forward.

withFreshIndexedDb()

let world: World | undefined
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  world?.dispose()
  world = undefined
  vi.useRealTimers()
})

/** The copy of a document of an account, with something written in it, and with or without changes that were never stored. */
async function keepCopy(
  userId: string,
  documentId: string,
  { unstored }: { unstored: boolean },
): Promise<{ copy: LocalCopy; doc: Y.Doc }> {
  const doc = new Y.Doc()
  const opening = openLocalCopy({ userId, workspaceId: 'w1', documentId }, doc)
  await advance(50)
  const copy = await opening
  if (copy === null) throw new Error('The copy should have opened')
  doc.getText('t').insert(0, `written in ${documentId}`)
  await advance(50)
  // What the server stored: the copy marked what the person wrote, and the marker goes when the server says it has it all.
  if (!unstored) {
    const settling = copy.settle(Y.snapshot(doc))
    await advance(50)
    await settling
  }
  return { copy, doc }
}

async function copiesOnDevice(userId: string): Promise<string[]> {
  const listing = copiesOf(userId)
  await advance(50)
  return listing
}

/** Leaves the account and moves the clock far enough for the wait to run out. */
async function leaving(options: Parameters<typeof leaveAccount>[0]): Promise<LeaveAccountOutcome> {
  const outcome = leaveAccount(options)
  await advance(UNSTORED_WAIT_MS + 1000)
  return outcome
}

const answering = (answer: boolean) => vi.fn(() => Promise.resolve(answer))

describe('leaving an account whose copies hold nothing that was never stored', () => {
  it('purges every copy of the account without asking', async () => {
    await keepCopy('u1', 'd1', { unstored: false })
    await keepCopy('u1', 'd2', { unstored: false })
    const confirm = answering(true)

    const outcome = await leaving({ userId: 'u1', network: fakeNetwork(), confirm })

    expect(outcome).toEqual({ purged: true })
    expect(confirm).not.toHaveBeenCalled()
    expect(await copiesOnDevice('u1')).toEqual([])
  })

  it('leaves the copies of the other accounts alone, the ones whose name only starts like it included', async () => {
    await keepCopy('u1', 'd1', { unstored: false })
    await keepCopy('u10', 'd1', { unstored: false })
    await keepCopy('u2', 'd1', { unstored: false })

    await leaving({ userId: 'u1', network: fakeNetwork(), confirm: answering(true) })

    expect(await copiesOnDevice('u10')).toEqual(['draftroom:u10:w1:d1'])
    expect(await copiesOnDevice('u2')).toEqual(['draftroom:u2:w1:d1'])
  })
})

describe('leaving an account with copies that hold changes that were never stored', () => {
  it('waits for them to be stored while online, and purges without asking once they are', async () => {
    const { copy, doc } = await keepCopy('u1', 'd1', { unstored: true })
    const confirm = answering(true)
    // The server stores it a second and a half into the wait.
    setTimeout(() => void copy.settle(Y.snapshot(doc)), 1500)

    const outcome = await leaving({ userId: 'u1', network: fakeNetwork(), confirm })

    expect(outcome).toEqual({ purged: true })
    expect(confirm).not.toHaveBeenCalled()
    expect(await copiesOnDevice('u1')).toEqual([])
  })

  it('names how many documents have changes that were never stored, and purges when the person confirms', async () => {
    await keepCopy('u1', 'd1', { unstored: true })
    await keepCopy('u1', 'd2', { unstored: true })
    await keepCopy('u1', 'd3', { unstored: false })
    const confirm = answering(true)

    const outcome = await leaving({ userId: 'u1', network: fakeNetwork(), confirm })

    expect(confirm).toHaveBeenCalledExactlyOnceWith(2)
    expect(outcome).toEqual({ purged: true })
    expect(await copiesOnDevice('u1')).toEqual([])
  })

  it('removes nothing when the person keeps them', async () => {
    await keepCopy('u1', 'd1', { unstored: true })
    await keepCopy('u1', 'd2', { unstored: false })

    const outcome = await leaving({ userId: 'u1', network: fakeNetwork(), confirm: answering(false) })

    expect(outcome).toEqual({ purged: false, unstoredDocuments: 1 })
    expect(await copiesOnDevice('u1')).toHaveLength(2)
  })

  it('does not wait while offline, because nothing can be stored: it asks at once', async () => {
    await keepCopy('u1', 'd1', { unstored: true })
    const network = fakeNetwork()
    network.set(false)
    const confirm = answering(true)

    const outcome = leaveAccount({ userId: 'u1', network, confirm })
    await advance(100)

    expect(confirm).toHaveBeenCalledExactlyOnceWith(1)
    await outcome
  })
})

describe('leaving an account in a browser that cannot say what it keeps', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    { case: 'there is no storage', arrange: () => vi.stubGlobal('indexedDB', undefined) },
    {
      case: 'reading the storage is refused',
      arrange: () =>
        Object.defineProperty(globalThis, 'indexedDB', {
          configurable: true,
          get: () => {
            throw new DOMException('The operation is insecure.', 'SecurityError')
          },
        }),
    },
  ])('has nothing to remove and does not ask when $case', async ({ arrange }) => {
    arrange()
    const confirm = answering(true)

    const outcome = await leaving({ userId: 'u1', network: fakeNetwork(), confirm })

    expect(outcome).toEqual({ purged: true })
    expect(confirm).not.toHaveBeenCalled()
  })

  it('fails when the storage cannot list its copies, instead of leaving as if there were none', async () => {
    vi.stubGlobal('indexedDB', { open: () => ({}) })
    const confirm = answering(true)

    const failure = expect(leaveAccount({ userId: 'u1', network: fakeNetwork(), confirm })).rejects.toThrow(
      'This browser cannot list the copies it keeps',
    )
    await advance(100)

    await failure
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('leaving an account while a document is open and storing what the person wrote', () => {
  it('waits for the server to store it, and then leaves without asking', async () => {
    world = createWorld()
    const session = world.open(editor, { keepCopy: true })
    await advance(100)
    world.server.holdStores()
    typeInto(session.doc, 'written just before leaving')
    await advance(100)
    const confirm = answering(true)
    // A second into the wait the database answers.
    setTimeout(() => world?.server.releaseStores(), 1000)

    const outcome = await leaving({ userId: editor.userId, network: world.network, confirm })

    expect(confirm).not.toHaveBeenCalled()
    expect(outcome).toEqual({ purged: true })
    expect(session.session.getSnapshot().state).not.toBe('error')
    expect(world.server.document(wireName).getText('t').toString()).toBe('written just before leaving')
    expect(await copiesOnDevice(editor.userId)).toEqual([])
  })

  it('asks when the server has not stored it by the end of the wait, and says how many documents', async () => {
    world = createWorld()
    const session = world.open(editor, { keepCopy: true })
    await advance(100)
    world.server.holdStores()
    typeInto(session.doc, 'written just before leaving')
    await advance(100)
    const confirm = answering(false)

    const outcome = await leaving({ userId: editor.userId, network: world.network, confirm })

    expect(confirm).toHaveBeenCalledExactlyOnceWith(1)
    expect(outcome).toEqual({ purged: false, unstoredDocuments: 1 })
    expect(await copiesOnDevice(editor.userId)).toEqual([copyName({ userId: editor.userId, workspaceId, documentId })])
  })
})
