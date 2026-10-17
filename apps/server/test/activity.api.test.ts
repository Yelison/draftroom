import { randomUUID } from 'node:crypto'
import type { Schema } from '@draftroom/contract'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ActivityType, Database } from '../src/db/tables.ts'
import { encodeCursor } from '../src/domain/pagination.ts'
import { apiOf, bodyAs, type Api } from './support/api.ts'
import { recordEvent, recordEventsAt } from './support/activity.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { instantsAgainstIds, setInstants } from './support/stamps.ts'
import { personFor, scenarios } from './support/scenarios.ts'
import { createTestApp, type TestApp } from './support/test-app.ts'
import { createDocument, createPerson, createWorkspace, grant, join, type Person } from './support/world.ts'

// What the history serves, by the rules of docs/api/README.md: only what the caller can read at the moment they ask, the
// events that reveal how a document is shared only to its owners, filters that combine, and pages that never skip or
// repeat an event. Who may call the operations at all is the access matrix's.

type Page = Schema<'ActivityPage'>

let database: TestDatabase
let db: Kysely<Database>
let server: TestApp
let api: Api
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  server = createTestApp(db)
  api = apiOf(server)
})
afterAll(async () => {
  await server.app.close()
  await database.drop()
})

/** A workspace with its owner, a member and a colleague who writes most of what happens, and no documents yet. */
async function newWorkspace() {
  const workspaceId = await createWorkspace(db)
  const owner = await createPerson(db, 'Marta Ruiz')
  const member = await createPerson(db, 'Priya Raman')
  const colleague = await createPerson(db, 'Daniel Okafor')
  await join(db, workspaceId, owner, 'owner')
  await join(db, workspaceId, member)
  await join(db, workspaceId, colleague)
  return { workspaceId, owner, member, colleague }
}

const workspaceActivity = async (as: Person, workspaceId: string, query = ''): Promise<Page> => {
  const response = await api({ as, method: 'GET', url: `/api/workspaces/${workspaceId}/activity${query}` })
  expect(response.statusCode).toBe(200)
  return bodyAs<Page>(response)
}

const documentActivity = async (as: Person, documentId: string, query = ''): Promise<Page> => {
  const response = await api({ as, method: 'GET', url: `/api/documents/${documentId}/activity${query}` })
  expect(response.statusCode).toBe(200)
  return bodyAs<Page>(response)
}

const idsOf = (page: Page): string[] => page.items.map((event) => event.id)
const titlesOf = (page: Page): string[] => [...new Set(page.items.map((event) => event.document.title))].sort()

describe('what a person is told of other documents', () => {
  it('leaves out the events of documents they cannot read, and holds those of the ones they can', async () => {
    const { workspaceId, member, colleague } = await newWorkspace()
    const shared = await createDocument(db, { workspaceId, creator: colleague, title: 'Shared plan' })
    await grant(db, { workspaceId, documentId: shared, person: member, role: 'viewer' })
    const open = await createDocument(db, {
      workspaceId,
      creator: colleague,
      title: 'Open notes',
      generalAccess: 'viewer',
    })
    const hidden = await createDocument(db, { workspaceId, creator: colleague, title: 'Private draft' })
    for (const documentId of [shared, open, hidden]) {
      await recordEvent(db, { workspaceId, documentId, actor: colleague })
    }

    const page = await workspaceActivity(member, workspaceId)

    expect(titlesOf(page)).toEqual(['Open notes', 'Shared plan'])
  })

  it('holds the events of every document for an owner of the workspace', async () => {
    const { workspaceId, owner, colleague } = await newWorkspace()
    const hidden = await createDocument(db, { workspaceId, creator: colleague, title: 'Private draft' })
    await recordEvent(db, { workspaceId, documentId: hidden, actor: colleague })

    const page = await workspaceActivity(owner, workspaceId)

    expect(titlesOf(page)).toEqual(['Private draft'])
  })

  it('stops telling them of a document once their access is revoked, through the API', async () => {
    const { workspaceId, member, colleague } = await newWorkspace()
    const documentId = await createDocument(db, { workspaceId, creator: colleague })
    await grant(db, { workspaceId, documentId, person: member, role: 'viewer' })
    await recordEvent(db, { workspaceId, documentId, actor: colleague })
    expect((await workspaceActivity(member, workspaceId)).items).toHaveLength(1)

    const revoked = await api({
      as: colleague,
      method: 'DELETE',
      url: `/api/documents/${documentId}/access/${member.id}`,
    })

    expect(revoked.statusCode).toBe(204)
    expect((await workspaceActivity(member, workspaceId)).items).toEqual([])
    // The revocation itself is an event about the document, which they cannot read any longer.
    expect((await api({ as: member, method: 'GET', url: `/api/documents/${documentId}/activity` })).statusCode).toBe(
      404,
    )
  })

  it('does not serve the next page of a list to a person whose access was revoked after the first', async () => {
    const { workspaceId, member, colleague } = await newWorkspace()
    const documentId = await createDocument(db, { workspaceId, creator: colleague })
    await grant(db, { workspaceId, documentId, person: member, role: 'viewer' })
    await recordEventsAt(db, 4, { workspaceId, documentId, actor: colleague, createdAt: '2026-10-13T10:00:00.000001Z' })
    const first = await workspaceActivity(member, workspaceId, '?limit=2')
    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).not.toBeNull()

    await db
      .deleteFrom('document_access')
      .where('document_id', '=', documentId)
      .where('user_id', '=', member.id)
      .execute()
    const next = await workspaceActivity(member, workspaceId, `?limit=2&cursor=${first.nextCursor}`)

    expect(next).toEqual({ items: [], nextCursor: null })
  })

  it('leaves out the events of an archived document, even for its owner', async () => {
    const { workspaceId, owner, colleague } = await newWorkspace()
    const live = await createDocument(db, { workspaceId, creator: colleague, title: 'Live' })
    const archived = await createDocument(db, { workspaceId, creator: colleague, title: 'Archived', archived: true })
    for (const documentId of [live, archived]) await recordEvent(db, { workspaceId, documentId, actor: colleague })

    const workspace = await workspaceActivity(owner, workspaceId)
    const ofArchived = await api({ as: owner, method: 'GET', url: `/api/documents/${archived}/activity` })

    expect(titlesOf(workspace)).toEqual(['Live'])
    expect(ofArchived.statusCode).toBe(404)
  })

  it('holds only the events of the workspace asked for', async () => {
    const here = await newWorkspace()
    const elsewhere = await createWorkspace(db, 'Almazara')
    await join(db, elsewhere, here.owner, 'owner')
    const other = await createDocument(db, { workspaceId: elsewhere, creator: here.owner, title: 'Elsewhere' })
    await recordEvent(db, { workspaceId: elsewhere, documentId: other, actor: here.owner })

    expect((await workspaceActivity(here.owner, here.workspaceId)).items).toEqual([])
  })

  it('cuts the page after the filter, so that events nobody may read do not leave it short', async () => {
    const { workspaceId, member, colleague } = await newWorkspace()
    const hidden = await createDocument(db, { workspaceId, creator: colleague })
    const readable = await createDocument(db, { workspaceId, creator: colleague, generalAccess: 'viewer' })
    await recordEventsAt(db, 5, {
      workspaceId,
      documentId: readable,
      actor: colleague,
      createdAt: '2026-10-13T09:00:00Z',
    })
    await recordEventsAt(db, 30, {
      workspaceId,
      documentId: hidden,
      actor: colleague,
      createdAt: '2026-10-13T10:00:00Z',
    })

    const page = await workspaceActivity(member, workspaceId, '?limit=5')

    expect(page.items).toHaveLength(5)
    expect(page.nextCursor).toBeNull()
  })
})

describe('the events that reveal how a document is shared', () => {
  const sharing: readonly ActivityType[] = [
    'access.granted',
    'access.changed',
    'access.revoked',
    'general-access.changed',
  ]

  /** A document with one event of every sharing kind and one that is not, and what each of its callers should see. */
  async function arranged(scenario: (typeof scenarios)[number]) {
    const { workspaceId, owner, colleague } = await newWorkspace()
    const documentId = await createDocument(db, { workspaceId, creator: owner })
    const subject = await personFor(db, scenario)
    await scenario.arrange({ db, workspaceId, documentId, subject })
    for (const type of [...sharing, 'document.renamed' as const]) {
      await recordEvent(db, { workspaceId, documentId, type, actor: owner, target: colleague })
    }
    return { workspaceId, documentId, subject }
  }

  const typesOf = (page: Page): string[] => page.items.map((event) => event.type).sort()
  const everything = [...sharing, 'document.renamed'].sort()

  describe.each([
    ['listDocumentActivity', (ids: { documentId: string }) => `/api/documents/${ids.documentId}/activity`],
    ['listWorkspaceActivity', (ids: { workspaceId: string }) => `/api/workspaces/${ids.workspaceId}/activity`],
  ])('in %s', (operationId, urlOf) => {
    const readers = scenarios.filter(
      (scenario) =>
        scenario.role !== null || (operationId === 'listWorkspaceActivity' && scenario.name.startsWith('member with')),
    )

    it.each(readers)('shows them to a $name only when the person is an owner of the document', async (scenario) => {
      const setting = await arranged(scenario)

      const response = await api({ as: setting.subject, method: 'GET', url: urlOf(setting) })
      const types = typesOf(bodyAs<Page>(response))

      const expected = scenario.role === 'owner' ? everything : scenario.role === null ? [] : ['document.renamed']
      expect(types).toEqual(expected)
    })
  })
})

describe('the filters of the history of a workspace', () => {
  // Two documents and two people, with events at known instants. `label` names an event in the expectations.
  async function arranged() {
    const { workspaceId, owner, colleague } = await newWorkspace()
    const plan = await createDocument(db, { workspaceId, creator: owner, title: 'Plan' })
    const notes = await createDocument(db, { workspaceId, creator: owner, title: 'Notes' })
    const events = {
      planByOwner: await recordEvent(db, {
        workspaceId,
        documentId: plan,
        actor: owner,
        createdAt: '2026-10-13T09:00:00Z',
      }),
      planByColleague: await recordEvent(db, {
        workspaceId,
        documentId: plan,
        actor: colleague,
        createdAt: '2026-10-13T10:00:00Z',
      }),
      notesByOwner: await recordEvent(db, {
        workspaceId,
        documentId: notes,
        actor: owner,
        createdAt: '2026-10-13T11:00:00Z',
      }),
      notesByColleague: await recordEvent(db, {
        workspaceId,
        documentId: notes,
        actor: colleague,
        createdAt: '2026-10-13T12:00:00Z',
      }),
      notesByServer: await recordEvent(db, {
        workspaceId,
        documentId: notes,
        actor: null,
        createdAt: '2026-10-13T13:00:00Z',
      }),
      // The same document and person as `notesByOwner`, one before the others and one after, so that each filter of
      // a combination is the only thing that tells these from the one the combination is after.
      notesByOwnerEarly: await recordEvent(db, {
        workspaceId,
        documentId: notes,
        actor: owner,
        createdAt: '2026-10-13T08:00:00Z',
      }),
      notesByOwnerLate: await recordEvent(db, {
        workspaceId,
        documentId: notes,
        actor: owner,
        createdAt: '2026-10-13T14:00:00Z',
      }),
    }
    return { workspaceId, owner, colleague, plan, notes, events }
  }

  type Setting = Awaited<ReturnType<typeof arranged>>
  const cases: readonly (readonly [string, (setting: Setting) => string, (events: Setting['events']) => string[]])[] = [
    [
      'no filter',
      () => '',
      (e) => [
        e.notesByOwnerLate,
        e.notesByServer,
        e.notesByColleague,
        e.notesByOwner,
        e.planByColleague,
        e.planByOwner,
        e.notesByOwnerEarly,
      ],
    ],
    ['a document', (s) => `?documentId=${s.plan}`, (e) => [e.planByColleague, e.planByOwner]],
    [
      'a person',
      (s) => `?actorId=${s.owner.id}`,
      (e) => [e.notesByOwnerLate, e.notesByOwner, e.planByOwner, e.notesByOwnerEarly],
    ],
    [
      'from an instant, which is included',
      () => '?from=2026-10-13T11:00:00Z',
      (e) => [e.notesByOwnerLate, e.notesByServer, e.notesByColleague, e.notesByOwner],
    ],
    [
      'to an instant, which is not',
      () => '?to=2026-10-13T11:00:00Z',
      (e) => [e.planByColleague, e.planByOwner, e.notesByOwnerEarly],
    ],
    ['a range', () => '?from=2026-10-13T10:00:00Z&to=2026-10-13T12:00:00Z', (e) => [e.notesByOwner, e.planByColleague]],
    ['a document and a person', (s) => `?documentId=${s.notes}&actorId=${s.colleague.id}`, (e) => [e.notesByColleague]],
    [
      'a document, a person and a range',
      (s) => `?documentId=${s.notes}&actorId=${s.owner.id}&from=2026-10-13T10:30:00Z&to=2026-10-13T13:00:00Z`,
      (e) => [e.notesByOwner],
    ],
    [
      'a person and a range that exclude each other',
      (s) => `?actorId=${s.colleague.id}&to=2026-10-13T09:30:00Z`,
      () => [],
    ],
  ]

  it.each(cases)('combine as %s say, newest first', async (_name, query, expected) => {
    const setting = await arranged()

    const page = await workspaceActivity(setting.owner, setting.workspaceId, query(setting))

    expect(idsOf(page)).toEqual(expected(setting.events))
  })

  it('answer a document that does not exist, one of another workspace and one they cannot read alike', async () => {
    const { workspaceId, member, colleague } = await newWorkspace()
    const hidden = await createDocument(db, { workspaceId, creator: colleague })
    const elsewhere = await createWorkspace(db, 'Almazara')
    await join(db, elsewhere, colleague)
    const foreign = await createDocument(db, { workspaceId: elsewhere, creator: colleague })
    for (const [space, documentId] of [
      [workspaceId, hidden],
      [elsewhere, foreign],
    ] as const) {
      await recordEvent(db, { workspaceId: space, documentId, actor: colleague })
    }

    const answers = await Promise.all(
      [randomUUID(), foreign, hidden].map((documentId) =>
        api({ as: member, method: 'GET', url: `/api/workspaces/${workspaceId}/activity?documentId=${documentId}` }),
      ),
    )

    expect(answers.map(({ statusCode, body }) => ({ statusCode, body }))).toEqual(
      Array.from({ length: 3 }, () => ({ statusCode: 200, body: { items: [], nextCursor: null } })),
    )
  })

  it('refuse an instant that is not one, and one PostgreSQL cannot hold, as a request that is not valid', async () => {
    const { workspaceId, owner } = await newWorkspace()

    const responses = await Promise.all(
      ['yesterday', '0000-01-01T00:00:00Z'].map((from) =>
        api({ as: owner, method: 'GET', url: `/api/workspaces/${workspaceId}/activity?from=${from}` }),
      ),
    )

    expect(responses.map(({ statusCode }) => statusCode)).toEqual([400, 400])
  })
})

describe('paging through the history', () => {
  /** Every event of a list, page by page, with the number of pages it took. */
  async function everyPage(as: Person, url: string, limit: number) {
    const ids: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const response = await api({
        as,
        method: 'GET',
        url: `${url}?limit=${limit}${cursor === null ? '' : `&cursor=${cursor}`}`,
      })
      expect(response.statusCode).toBe(200)
      const page = bodyAs<Page>(response)
      ids.push(...idsOf(page))
      cursor = page.nextCursor
      pages++
    } while (cursor !== null)
    return { ids, pages }
  }

  it('keeps a stable order, without skipping or repeating an event, when many share one instant', async () => {
    const { workspaceId, owner, colleague } = await newWorkspace()
    const documentId = await createDocument(db, { workspaceId, creator: owner })
    const simultaneous = await recordEventsAt(db, 60, {
      workspaceId,
      documentId,
      actor: colleague,
      createdAt: '2026-10-13T10:00:00.123456Z',
    })
    const before = await recordEvent(db, {
      workspaceId,
      documentId,
      actor: colleague,
      createdAt: '2026-10-13T09:00:00Z',
    })
    const after = await recordEvent(db, {
      workspaceId,
      documentId,
      actor: colleague,
      createdAt: '2026-10-13T11:00:00Z',
    })

    const paged = await everyPage(owner, `/api/workspaces/${workspaceId}/activity`, 7)

    expect(paged.ids).toEqual([after, ...[...simultaneous].sort().reverse(), before])
    expect(paged.pages).toBe(Math.ceil(62 / 7))
  })

  it('orders events of one millisecond by id, whatever their microseconds, and loses none when paged by two', async () => {
    const { workspaceId, owner, colleague } = await newWorkspace()
    const documentId = await createDocument(db, { workspaceId, creator: owner })
    const events = await recordEventsAt(db, 5, {
      workspaceId,
      documentId,
      actor: colleague,
      createdAt: '2026-10-13T10:00:00Z',
    })
    await setInstants(db, 'activity_events', 'created_at', instantsAgainstIds(events, 123))

    const paged = await everyPage(owner, `/api/workspaces/${workspaceId}/activity`, 2)

    expect(paged.ids).toEqual([...events].sort().reverse())
  })

  it('ends on the page that holds the last event, not on one more that is empty', async () => {
    const { workspaceId, owner, colleague } = await newWorkspace()
    const documentId = await createDocument(db, { workspaceId, creator: owner })
    await recordEventsAt(db, 6, { workspaceId, documentId, actor: colleague, createdAt: '2026-10-13T10:00:00Z' })

    const paged = await everyPage(owner, `/api/workspaces/${workspaceId}/activity`, 3)

    expect(paged.pages).toBe(2)
    expect(paged.ids).toHaveLength(6)
  })

  it('pages the activity of one document the same way', async () => {
    const { workspaceId, owner, colleague } = await newWorkspace()
    const documentId = await createDocument(db, { workspaceId, creator: owner })
    const other = await createDocument(db, { workspaceId, creator: owner })
    const mine = await recordEventsAt(db, 9, {
      workspaceId,
      documentId,
      actor: colleague,
      createdAt: '2026-10-13T10:00:00Z',
    })
    await recordEventsAt(db, 4, { workspaceId, documentId: other, actor: colleague, createdAt: '2026-10-13T10:00:00Z' })

    const paged = await everyPage(owner, `/api/documents/${documentId}/activity`, 4)

    expect(paged.ids).toEqual([...mine].sort().reverse())
  })

  describe('with a cursor that does not belong to the request', () => {
    /** A workspace with three events and the first page of its history, one event long. */
    async function startedList() {
      const { workspaceId, owner, colleague } = await newWorkspace()
      const documentId = await createDocument(db, { workspaceId, creator: owner })
      await recordEventsAt(db, 3, { workspaceId, documentId, actor: colleague, createdAt: '2026-10-13T10:00:00Z' })
      const first = await workspaceActivity(owner, workspaceId, '?limit=1')
      return { workspaceId, documentId, owner, colleague, cursor: first.nextCursor }
    }
    const refusedAtTheCursor = {
      statusCode: 400,
      body: { code: 'validation-failed', errors: [{ pointer: '/query/cursor', code: 'invalid-value' }] },
    }

    it('refuses it with other filters than the ones it was issued for', async () => {
      const { workspaceId, owner, colleague, cursor } = await startedList()

      const response = await api({
        as: owner,
        method: 'GET',
        url: `/api/workspaces/${workspaceId}/activity?limit=1&actorId=${colleague.id}&cursor=${cursor}`,
      })

      expect(response).toMatchObject(refusedAtTheCursor)
    })

    it('refuses a text that is not a cursor', async () => {
      const { workspaceId, owner } = await startedList()

      const response = await api({
        as: owner,
        method: 'GET',
        url: `/api/workspaces/${workspaceId}/activity?cursor=not-a-cursor`,
      })

      expect(response).toMatchObject(refusedAtTheCursor)
    })

    it('refuses a made-up cursor with a year that does not exist, as invalid and not as a failure of the server', async () => {
      const { workspaceId, owner } = await newWorkspace()
      const filters = { workspaceId, documentId: null, actorId: null, from: null, to: null }
      const cursor = encodeCursor({ timestamp: '0000-06-01T00:00:00.000000Z', id: randomUUID() }, filters)

      const response = await api({
        as: owner,
        method: 'GET',
        url: `/api/workspaces/${workspaceId}/activity?cursor=${cursor}`,
      })

      expect(response).toMatchObject(refusedAtTheCursor)
    })

    it('does not let the cursor of a document continue the list of another', async () => {
      const { workspaceId, owner, colleague } = await newWorkspace()
      const first = await createDocument(db, { workspaceId, creator: owner })
      const second = await createDocument(db, { workspaceId, creator: owner })
      for (const documentId of [first, second]) {
        await recordEventsAt(db, 3, { workspaceId, documentId, actor: colleague, createdAt: '2026-10-13T10:00:00Z' })
      }
      const page = await documentActivity(owner, first, '?limit=1')

      const response = await api({
        as: owner,
        method: 'GET',
        url: `/api/documents/${second}/activity?limit=1&cursor=${page.nextCursor}`,
      })

      expect(response).toMatchObject(refusedAtTheCursor)
    })
  })
})

describe('how an event is told', () => {
  it('names who did it and what it is about, and says nobody when the server acted', async () => {
    const { workspaceId, owner, colleague } = await newWorkspace()
    const documentId = await createDocument(db, { workspaceId, creator: owner, title: 'Autumn launch plan' })
    await recordEvent(db, {
      workspaceId,
      documentId,
      type: 'version.created',
      actor: null,
      createdAt: '2026-10-13T10:00:00Z',
    })
    await recordEvent(db, {
      workspaceId,
      documentId,
      type: 'access.granted',
      actor: owner,
      target: colleague,
      createdAt: '2026-10-13T11:00:00Z',
    })

    const { items } = await documentActivity(owner, documentId)

    expect(items).toMatchObject([
      {
        type: 'access.granted',
        createdAt: '2026-10-13T11:00:00.000Z',
        actor: { id: owner.id, name: 'Marta Ruiz' },
        document: { id: documentId, title: 'Autumn launch plan' },
        targetUser: { id: colleague.id, name: 'Daniel Okafor' },
      },
      { type: 'version.created', actor: null, targetUser: null },
    ])
  })

  it('names a member who has not signed up by the address they were added with, cut to what a name may hold', async () => {
    const { workspaceId, owner } = await newWorkspace()
    const documentId = await createDocument(db, { workspaceId, creator: owner })
    const email = `${'a'.repeat(100)}@harborpine.example`
    const { id } = await db.insertInto('users').values({ email, name: null }).returning('id').executeTakeFirstOrThrow()
    await join(db, workspaceId, { id })
    await recordEvent(db, { workspaceId, documentId, type: 'access.granted', actor: owner, target: { id } })

    const { items } = await documentActivity(owner, documentId)

    expect(items[0]?.targetUser).toEqual({ id, name: email.slice(0, 80) })
  })

  it('serves what the writes of the API leave behind, in the order it happened', async () => {
    const { workspaceId, owner, colleague } = await newWorkspace()
    const created = await api({
      as: colleague,
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      body: { title: 'Budget' },
    })
    const document = bodyAs<Schema<'Document'>>(created)
    await api({
      as: colleague,
      method: 'PATCH',
      url: `/api/documents/${document.id}`,
      body: { title: 'Budget 2027', revision: document.revision },
    })
    await api({
      as: colleague,
      method: 'PUT',
      url: `/api/documents/${document.id}/access/${owner.id}`,
      body: { role: 'editor' },
    })

    const inTheWorkspace = await workspaceActivity(owner, workspaceId)
    const inTheDocument = await documentActivity(colleague, document.id)

    const summary = (page: Page) => page.items.map(({ type, actor }) => [type, actor?.name])
    const expected = [
      ['access.granted', 'Daniel Okafor'],
      ['document.renamed', 'Daniel Okafor'],
      ['document.created', 'Daniel Okafor'],
    ]
    expect(summary(inTheWorkspace)).toEqual(expected)
    expect(summary(inTheDocument)).toEqual(expected)
  })
})
