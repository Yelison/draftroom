import { documentName } from '@draftroom/contract/collab'
import { describe, expect, it } from 'vitest'
import type { AccessFacts } from '../db/access/queries.ts'
import type { DocumentRole, GeneralAccess, WorkspaceRole } from '../db/tables.ts'
import { selects, type ClosePlan } from './closeConnections.ts'
import type { ConnectionContext } from './context.ts'
import { RecordingLog } from '../../test/support/collab/harness.ts'
import { createLiveAccess, type AccessFactsSource } from './revocation.ts'
import type { ConnectionTarget } from './server.ts'

// What each change of access does to the connections that are open, from the facts the database would give and with no
// sockets: a fake collaboration server says which of a few connections each call would have ended and with what.

const documentId = '00000000-0000-4000-8000-000000000001'
const otherDocumentId = '00000000-0000-4000-8000-000000000002'
const workspaceId = '00000000-0000-4000-8000-0000000000aa'

const connection = (
  userId: string,
  role: DocumentRole,
  overrides: Partial<ConnectionContext> = {},
): ConnectionContext => ({
  userId,
  workspaceId,
  role,
  displayName: userId,
  sessionId: null,
  sequence: 0,
  ...overrides,
})

const facts = (
  userId: string,
  {
    workspaceRole = 'member',
    grant = null,
    generalAccess = 'none',
    archived = false,
    id = documentId,
  }: {
    workspaceRole?: WorkspaceRole | null
    grant?: DocumentRole | null
    generalAccess?: GeneralAccess
    archived?: boolean
    id?: string
  },
): AccessFacts => ({ documentId: id, userId, workspaceRole, grant, generalAccess, archived })

interface Call {
  readonly code: ClosePlan['code']
  readonly event: ClosePlan['event']
  /** The people whose connection on `documentId` the call would end. */
  readonly ended: readonly string[]
}

function setUp(source: Partial<AccessFactsSource>, open: readonly ConnectionContext[]) {
  const calls: Call[] = []
  const told: string[] = []
  /** The people whose connection the call would tell, without ending it. */
  const noticed: string[] = []
  const log = new RecordingLog()
  const live = createLiveAccess({
    facts: {
      ofDocument: () => Promise.reject(new Error('not read')),
      ofMember: () => Promise.reject(new Error('not read')),
      ...source,
    },
    collaboration: {
      endConnections(target: ConnectionTarget, plan: ClosePlan) {
        const ended = open.filter((context) => selects(target, documentName(documentId), context))
        calls.push({ code: plan.code, event: plan.event, ended: ended.map(({ userId }) => userId) })
        return ended.length
      },
      tell(target: ConnectionTarget) {
        const reached = open.filter((context) => selects(target, documentName(documentId), context))
        noticed.push(...reached.map(({ userId }) => userId))
        return reached.length
      },
    },
    broadcaster: { broadcast: (id, event) => told.push(`${id} ${event.type}`) },
    log,
  })
  return { live, calls, told, noticed, log }
}

const endedWith = (calls: readonly Call[], code: Call['code']): readonly string[] =>
  calls.filter((call) => call.code === code).flatMap((call) => call.ended)

describe('a change to who can open a document', () => {
  // Rows: the connection of a person, what the database says they hold now, and how the connection ends.
  const rows: readonly (readonly [string, DocumentRole, Parameters<typeof facts>[1], Call['code'] | null])[] = [
    ['an editor lowered to viewer', 'editor', { grant: 'viewer' }, 'role-changed'],
    ['a viewer raised to editor', 'viewer', { grant: 'editor' }, 'role-changed'],
    ['an editor raised to owner, who writes as before', 'editor', { grant: 'owner' }, null],
    ['an owner lowered to editor, who writes as before', 'owner', { grant: 'editor' }, null],
    ['a commenter lowered to viewer, who reads as before', 'commenter', { grant: 'viewer' }, null],
    ['an editor whose grant was removed, with nothing else to open it', 'editor', {}, 'access-revoked'],
    [
      'an editor whose grant was removed, with general access viewer',
      'editor',
      { generalAccess: 'viewer' },
      'role-changed',
    ],
    ['an editor whose grant was removed, with general access editor', 'editor', { generalAccess: 'editor' }, null],
    ['a viewer who is a workspace owner now', 'viewer', { workspaceRole: 'owner' }, 'role-changed'],
    [
      'an editor who is no longer in the workspace',
      'editor',
      { workspaceRole: null, grant: 'editor' },
      'access-revoked',
    ],
    [
      'an editor, on a document that was archived meanwhile',
      'editor',
      { grant: 'editor', archived: true },
      'access-revoked',
    ],
    [
      'an owner, on a document that was archived meanwhile: archiving recycles that connection, not this change',
      'owner',
      { grant: 'owner', archived: true },
      null,
    ],
  ]

  it.each(rows)('closes %s as the table says', async (_who, connected, now, code) => {
    const { live, calls } = setUp({ ofDocument: async () => [facts('ana', now)] }, [connection('ana', connected)])

    await live.documentChanged(documentId)

    expect(endedWith(calls, 'access-revoked')).toEqual(code === 'access-revoked' ? ['ana'] : [])
    expect(endedWith(calls, 'role-changed')).toEqual(code === 'role-changed' ? ['ana'] : [])
  })

  it('leaves alone the people nothing changed for, and closes the one whom it did', async () => {
    const { live, calls } = setUp(
      { ofDocument: async () => [facts('ana', { grant: 'editor' }), facts('ben', { grant: 'viewer' })] },
      [connection('ana', 'editor'), connection('ben', 'editor')],
    )

    await live.documentChanged(documentId)

    expect(endedWith(calls, 'role-changed')).toEqual(['ben'])
    expect(endedWith(calls, 'access-revoked')).toEqual([])
  })

  it('closes a person who has no facts at all: nobody left in the workspace is somebody who may open it', async () => {
    const { live, calls } = setUp({ ofDocument: async () => [] }, [connection('ana', 'editor')])

    await live.documentChanged(documentId)

    expect(endedWith(calls, 'access-revoked')).toEqual(['ana'])
  })

  it('tells the connections of the document first, so the ones that are closed hear why', async () => {
    const order: string[] = []
    const live = createLiveAccess({
      facts: { ofDocument: async () => [], ofMember: async () => [] },
      collaboration: { endConnections: () => order.push('closed'), tell: () => 0 },
      broadcaster: { broadcast: () => order.push('told') },
      log: new RecordingLog(),
    })

    await live.documentChanged(documentId)

    expect(order.at(0)).toBe('told')
    expect(order).toContain('closed')
  })

  it('closes every connection of the document, to be authenticated again, when it cannot read what the person holds', async () => {
    const { live, calls, told, log } = setUp({ ofDocument: () => Promise.reject(new Error('no database')) }, [
      connection('ana', 'editor'),
      connection('ben', 'viewer'),
    ])

    await live.documentChanged(documentId)

    expect(calls).toEqual([{ code: 'role-changed', event: undefined, ended: ['ana', 'ben'] }])
    expect(told).toEqual([`${documentId} access-changed`])
    expect(log.entries.map(({ level }) => level)).toEqual(['error'])
  })
})

describe('a document that is archived, restored or deleted', () => {
  // Rows: the connection of a person, what the database says they hold once the document is archived, and how it ends.
  const archiving: readonly (readonly [string, DocumentRole, Parameters<typeof facts>[1], Call['code']])[] = [
    ['an editor, who loses the document', 'editor', { grant: 'editor', archived: true }, 'access-revoked'],
    ['a viewer, who loses the document', 'viewer', { grant: 'viewer', archived: true }, 'access-revoked'],
    ['an owner, who reconnects read-only', 'owner', { grant: 'owner', archived: true }, 'role-changed'],
    [
      'an owner of the workspace, who reconnects read-only',
      'owner',
      { workspaceRole: 'owner', archived: true },
      'role-changed',
    ],
  ]

  it.each(archiving)('archived: closes %s, the notice with the close', async (_who, connected, now, code) => {
    const { live, calls } = setUp({ ofDocument: async () => [facts('ana', now)] }, [connection('ana', connected)])

    await live.documentArchived(documentId)

    expect(calls.filter((call) => call.ended.length > 0)).toEqual([
      { code, event: { type: 'document-archived' }, ended: ['ana'] },
    ])
  })

  it('archived: closes each person by what they hold, in one change', async () => {
    const { live, calls } = setUp(
      {
        ofDocument: async () => [
          facts('ana', { grant: 'owner', archived: true }),
          facts('ben', { grant: 'editor', archived: true }),
        ],
      },
      [connection('ana', 'owner'), connection('ben', 'editor')],
    )

    await live.documentArchived(documentId)

    expect([endedWith(calls, 'role-changed'), endedWith(calls, 'access-revoked')]).toEqual([['ana'], ['ben']])
  })

  it('archived: closes every connection to authenticate again when it cannot read what the people hold', async () => {
    const { live, calls, log } = setUp({ ofDocument: () => Promise.reject(new Error('no database')) }, [
      connection('ana', 'owner'),
      connection('ben', 'editor'),
    ])

    await live.documentArchived(documentId)

    expect(calls).toEqual([{ code: 'role-changed', event: { type: 'document-archived' }, ended: ['ana', 'ben'] }])
    expect(log.entries.map(({ level }) => level)).toEqual(['error'])
  })

  it('restored: recycles every connection, with the notice, without reading anything', async () => {
    const { live, calls } = setUp({}, [connection('ana', 'owner'), connection('ben', 'owner')])

    await live.documentRestored(documentId)

    expect(calls).toEqual([{ code: 'role-changed', event: { type: 'access-changed' }, ended: ['ana', 'ben'] }])
  })

  it('deleted: closes every connection with 4403 and no notice, without reading anything', async () => {
    const { live, calls } = setUp({}, [connection('ana', 'owner'), connection('ben', 'editor')])

    await live.documentDeleted(documentId)

    expect(calls).toEqual([{ code: 'access-revoked', event: undefined, ended: ['ana', 'ben'] }])
  })
})

describe('a change to a member of a workspace', () => {
  it('closes only the connections of that person in that workspace, each with the notice', async () => {
    const elsewhere = '00000000-0000-4000-8000-0000000000bb'
    const { live, calls } = setUp({ ofMember: async () => [] }, [
      connection('ana', 'editor'),
      connection('ana', 'editor', { workspaceId: elsewhere }),
      connection('ben', 'editor'),
    ])

    await live.memberChanged(workspaceId, 'ana')

    expect(calls).toEqual([
      { code: 'access-revoked', event: { type: 'access-changed' }, ended: ['ana'] },
      { code: 'role-changed', event: { type: 'access-changed' }, ended: [] },
    ])
  })

  it('tells the connections that stay, whose role may have changed with the mode kept, and none of the ones it closes', async () => {
    const { live, calls, noticed } = setUp({ ofMember: async () => [facts('ana', { grant: 'editor' })] }, [
      connection('ana', 'owner'),
      connection('ben', 'editor'),
    ])

    await live.memberChanged(workspaceId, 'ana')

    // An owner of the workspace made a member, who keeps an editor grant: the mode is the same, so nothing is closed.
    expect(endedWith(calls, 'access-revoked').concat(endedWith(calls, 'role-changed'))).toEqual([])
    expect(noticed).toEqual(['ana'])
  })

  it('tells nobody a connection it closes: the notice goes in its close', async () => {
    const { live, noticed } = setUp({ ofMember: async () => [] }, [connection('ana', 'editor')])

    await live.memberChanged(workspaceId, 'ana')

    expect(noticed).toEqual([])
  })

  it('holds each document to what the person holds on it: one is revoked and another is only lowered', async () => {
    const calls: [string, string][] = []
    const live = createLiveAccess({
      facts: {
        ofDocument: async () => [],
        ofMember: async () => [
          facts('ana', { grant: 'viewer', id: documentId }),
          facts('ana', { id: otherDocumentId }),
        ],
      },
      collaboration: {
        endConnections({ where }, { code }) {
          for (const id of [documentId, otherDocumentId]) {
            if (where?.(connection('ana', 'editor'), id) === true) calls.push([id, code])
          }
          return 0
        },
        tell: () => 0,
      },
      broadcaster: { broadcast: () => undefined },
      log: new RecordingLog(),
    })

    await live.memberChanged(workspaceId, 'ana')

    expect(calls).toEqual([
      [otherDocumentId, 'access-revoked'],
      [documentId, 'role-changed'],
    ])
  })

  it('closes all of their connections in the workspace to authenticate again when it cannot read what they hold', async () => {
    const { live, calls, log } = setUp({ ofMember: () => Promise.reject(new Error('no database')) }, [
      connection('ana', 'editor'),
      connection('ben', 'editor'),
    ])

    await live.memberChanged(workspaceId, 'ana')

    expect(calls).toEqual([{ code: 'role-changed', event: { type: 'access-changed' }, ended: ['ana'] }])
    expect(log.entries.map(({ level }) => level)).toEqual(['error'])
  })
})

describe('a session that ends', () => {
  it('ends the connections of that session and no other, with the code of a session that is over', async () => {
    const ended: { target: ConnectionTarget; plan: ClosePlan }[] = []
    const live = createLiveAccess({
      facts: {
        ofDocument: () => Promise.reject(new Error('not read')),
        ofMember: () => Promise.reject(new Error('not read')),
      },
      collaboration: {
        endConnections(target: ConnectionTarget, plan: ClosePlan) {
          ended.push({ target, plan })
          return 1
        },
        tell: () => 0,
      },
      broadcaster: { broadcast: () => undefined },
      log: new RecordingLog(),
    })

    await live.sessionEnded('session-1')

    expect(ended).toEqual([{ target: { sessionId: 'session-1' }, plan: { code: 'unauthenticated' } }])
  })
})
