import { MAX_AWARENESS_STATE_BYTES, documentName } from '@draftroom/contract/collab'
import type { Kysely } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import { outgoing } from '../support/collab/frames.ts'
import { startCollab, type CollabHarness } from '../support/collab/harness.ts'
import { ClientSet, type DocumentClient } from '../support/collab/provider-client.ts'
import { RawClient } from '../support/collab/raw-client.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from '../support/world.ts'

// Presence is shown to everyone, so a client must not speak as another person or erase their presence (protocol §5.3).
// The attacker here is an editor with a hand-made client; what is looked at is the awareness the server holds and what a
// witness, who is another person's browser, is ever told.

let database: TestDatabase
let db: Kysely<Database>
let collab: CollabHarness
let clients: ClientSet
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  collab = await startCollab(db)
  clients = new ClientSet(collab.url)
})
afterEach(() => clients.destroyAll())
afterAll(async () => {
  await collab.close()
  await database.drop()
})

let victim: Person
let attacker: Person
let workspaceId: string
beforeAll(async () => {
  workspaceId = await createWorkspace(db)
  victim = await createPerson(db, 'Marta Ruiz')
  attacker = await createPerson(db, 'Eli Vega')
  await join(db, workspaceId, victim, 'owner')
  await join(db, workspaceId, attacker)
})

const colour = '#3366cc'

interface Room {
  readonly documentId: string
  /** The victim, with their presence published, as seen by the server. */
  readonly victim: DocumentClient
  /** Another person's browser: every client id it is ever told about is recorded. */
  readonly witness: DocumentClient
  readonly toldToWitness: Set<number>
  readonly hostile: RawClient
  /** What the server holds as presence for a Yjs awareness client id. */
  presenceOf(clientId: number): unknown
  /** Resolves when the presence the server holds satisfies the condition: a change that has no message to wait for. */
  untilPresence(holds: (states: ReadonlyMap<number, unknown>) => boolean): Promise<void>
  /** Sends the awareness entries, then waits until the server has dealt with them. */
  say(entries: Parameters<typeof outgoing.awareness>[1]): Promise<void>
}

/** What the tests use of the awareness of a document: `y-protocols` is not a dependency of this workspace. */
interface PresenceSource {
  getStates(): Map<number, unknown>
  on(event: 'update', listener: () => void): void
  off(event: 'update', listener: () => void): void
}

function serverAwarenessWhere(
  live: () => { awareness: PresenceSource },
  holds: (states: ReadonlyMap<number, unknown>) => boolean,
): Promise<void> {
  const { awareness } = live()
  return new Promise((resolve) => {
    const check = () => {
      if (!holds(awareness.getStates())) return
      awareness.off('update', check)
      resolve()
    }
    awareness.on('update', check)
    check()
  })
}

/** Resolves when the witness's browser shows this colour for the client id: the change has been relayed to it. */
function witnessSees(witness: DocumentClient, clientId: number, colour: string): Promise<void> {
  const awareness = witness.provider.awareness
  if (awareness === null) throw new Error('The witness has no awareness')
  return new Promise((resolve) => {
    const check = () => {
      const state: unknown = awareness.getStates().get(clientId)
      if (typeof state !== 'object' || state === null || !('user' in state)) return
      const { user } = state
      if (typeof user !== 'object' || user === null || !('color' in user) || user.color !== colour) return
      awareness.off('update', check)
      resolve()
    }
    awareness.on('update', check)
    check()
  })
}

async function enterRoom(): Promise<Room> {
  const documentId = await createDocument(db, { workspaceId, creator: victim })
  await grant(db, { workspaceId, documentId, person: attacker, role: 'editor' })
  const victimClient = clients.open(documentId, { email: victim.email })
  const witness = clients.open(documentId, { email: victim.email })
  await Promise.all([victimClient.waitForSynced(), witness.waitForSynced()])
  victimClient.provider.setAwarenessField('user', { id: victim.id, name: 'Marta Ruiz', color: colour })
  let beat = 0
  const toldToWitness = new Set<number>()
  witness.provider.awareness?.on('update', ({ added, updated }: { added: number[]; updated: number[] }) => {
    for (const clientId of [...added, ...updated]) toldToWitness.add(clientId)
  })

  const live = () => {
    const document = collab.server.hocuspocus.documents.get(documentName(documentId))
    if (document === undefined) throw new Error('The document is not loaded')
    return document
  }
  const hostile = await RawClient.connect(collab.url, { email: attacker.email })
  hostile.authenticate(documentId)
  await hostile.waitFor('authenticated')
  // The victim's presence has reached the server before anything is tried against it.
  await serverAwarenessWhere(live, (states) => states.has(victimClient.doc.clientID))
  return {
    documentId,
    victim: victimClient,
    witness,
    toldToWitness,
    hostile,
    presenceOf: (clientId) => live().awareness.getStates().get(clientId),
    untilPresence: (holds) => serverAwarenessWhere(live, holds),
    async say(entries) {
      hostile.send(outgoing.awareness(documentName(documentId), entries))
      // A connection's messages are handled in order: the answer to this one comes after the awareness was dealt with.
      const mark = hostile.mark
      hostile.send(outgoing.syncStep1(documentName(documentId), new Uint8Array([0])))
      await hostile.waitFor('sync', () => true, mark)
      // What the server relays to the witness arrives in the order it was applied. The victim now changes their colour, a
      // change the server does relay, and once the witness shows it, whatever was relayed before it has arrived too.
      beat += 1
      const marker = `#00${beat.toString(16).padStart(4, '0')}`
      victimClient.provider.setAwarenessField('user', { id: victim.id, name: 'Marta Ruiz', color: marker })
      await witnessSees(witness, victimClient.doc.clientID, marker)
    },
  }
}

describe('a state an attacker publishes for themselves', () => {
  const attackerClientId = 1_001
  const valid = () => ({ id: attacker.id, name: 'whatever', color: colour })

  // What reaches the server's awareness, and so everyone, for each state the client says.
  // Thunks, because the people exist only once the file has set up its database.
  const rows: readonly (readonly [string, () => object, (() => object) | undefined])[] = [
    [
      'their own, as the editor writes it',
      () => ({ user: valid(), cursor: { anchor: 1, head: 3 } }),
      () => ({ user: { ...valid(), name: 'Eli Vega' }, cursor: { anchor: 1, head: 3 } }),
    ],
    [
      'a name that is another person’s',
      () => ({ user: { ...valid(), name: 'Marta Ruiz' } }),
      () => ({ user: { ...valid(), name: 'Eli Vega' } }),
    ],
    [
      'keys beyond user and cursor',
      () => ({ user: valid(), admin: true }),
      () => ({ user: { ...valid(), name: 'Eli Vega' } }),
    ],
    ['the identity of another person', () => ({ user: { ...valid(), id: victim.id } }), undefined],
    [
      'a colour that is not a plain hexadecimal one',
      () => ({ user: { ...valid(), color: 'red; background: url(//evil)' } }),
      undefined,
    ],
    [
      'more than the size of a presence state',
      () => ({ user: valid(), cursor: 'x'.repeat(MAX_AWARENESS_STATE_BYTES) }),
      undefined,
    ],
  ]

  it.each(rows)('%s', async (_description, state, relayed) => {
    const room = await enterRoom()

    await room.say([{ clientId: attackerClientId, clock: 1, state: state() }])

    expect(room.presenceOf(attackerClientId)).toEqual(relayed?.())
    // Never applied, so never relayed: the witness is not told about the client id when the state is dropped.
    expect(room.toldToWitness.has(attackerClientId)).toBe(relayed !== undefined)
    room.hostile.terminate()
  })
})

describe('the presence of another person', () => {
  it('cannot be taken over: a client id another connection owns is dropped', async () => {
    const room = await enterRoom()
    await room.say([
      {
        clientId: room.victim.doc.clientID,
        clock: 99,
        state: { user: { id: attacker.id, name: 'Eli', color: colour } },
      },
    ])

    // Still the victim's: the attacker's identity did not replace it (the colour is the one `say` published as its marker).
    expect(room.presenceOf(room.victim.doc.clientID)).toMatchObject({ user: { id: victim.id, name: 'Marta Ruiz' } })
    room.hostile.terminate()
  })

  it('cannot be erased: a removal of a client id another connection owns is ignored', async () => {
    const room = await enterRoom()

    await room.say([{ clientId: room.victim.doc.clientID, clock: 99, state: null }])

    expect(room.presenceOf(room.victim.doc.clientID)).toMatchObject({ user: { id: victim.id } })
    room.hostile.terminate()
  })

  it('is removed with its own connection, and the client id is free again afterwards', async () => {
    const room = await enterRoom()
    const clientId = 2_002
    await room.say([{ clientId, clock: 1, state: { user: { id: attacker.id, name: '', color: colour } } }])
    expect(room.presenceOf(clientId)).toBeDefined()

    room.hostile.terminate()
    await room.untilPresence((states) => !states.has(clientId))

    expect(room.presenceOf(clientId)).toBeUndefined()
  })
})
