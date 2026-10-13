import type { ErrorCode, Schema } from '@draftroom/contract'
import { describe, expect, it } from 'vitest'
import type { DataSource } from './DataSource.ts'
import { ApiError, isApiError } from './errors.ts'

/**
 * One battery of behaviour for any `DataSource`: pagination, the rule of 404 against 403, revisions, limits, sharing and
 * the hand-over of a removed member. It is written against the interface alone and creates every row it reads, so it
 * runs unchanged on the mock now and on the real server in T2.4, and a mock that drifts from the server fails the same
 * assertions the server does.
 *
 * What it does not do: prove the whole permission matrix (the server's own tests do) or anything about content, which
 * travels over the collaboration connection.
 */

/** The people and the workspace a test of the suite works in, provided fresh for each test by whoever runs it. */
export interface Scenario {
  workspaceId: string
  /** Owner of the workspace. */
  owner: DataSource
  ownerId: string
  /** An ordinary member of the workspace, with no access to anything the owner has not shared. */
  member: DataSource
  memberId: string
  /** Signed in, and a member of some other workspace only. */
  outsider: DataSource
  /** Nobody is signed in. */
  anonymous: DataSource
}

export interface Harness {
  scenario(): Promise<Scenario>
}

const document = (documentId: string) => ({ params: { path: { documentId } } })
const inWorkspace = (workspaceId: string) => ({ params: { path: { workspaceId } } })

/** What a refusal is, in the terms a screen branches on: the status, the stable code and the field it names. */
async function refusalOf(call: Promise<unknown>): Promise<ApiError> {
  const error = await call.then(
    () => undefined,
    (caught: unknown) => caught,
  )
  if (!isApiError(error)) throw new Error(`Expected the call to be refused, got ${String(error)}`, { cause: error })
  return error
}

async function expectRefusal(call: Promise<unknown>, code: ErrorCode, pointer?: string) {
  const error = await refusalOf(call)
  expect(error.code).toBe(code)
  if (pointer !== undefined) expect(error.fieldErrors.map((field) => field.pointer)).toContain(pointer)
}

const unique = () => crypto.randomUUID()

/** A text of `length` Unicode code points, each one a character that takes two UTF-16 units. */
const emoji = (length: number) => '😀'.repeat(length)

type Document = Schema<'Document'>

/** Whether rows are in the order of a newest-first list: by instant, as time and not as text, then by id. */
function isNewestFirst(rows: readonly { instant: string; id: string }[]): boolean {
  return rows.every((row, index) => {
    const previous = rows[index - 1]
    if (previous === undefined) return true
    const difference = Date.parse(previous.instant) - Date.parse(row.instant)
    return difference > 0 || (difference === 0 && previous.id > row.id)
  })
}

export function describeDataSourceContract(name: string, harness: Harness) {
  describe(`DataSource contract: ${name}`, () => {
    describe('who is asking', () => {
      it('refuses a request with no session as unauthenticated', async () => {
        const { anonymous, workspaceId } = await harness.scenario()

        await expectRefusal(anonymous.getMe(), 'unauthenticated')
        await expectRefusal(anonymous.listFolders(inWorkspace(workspaceId)), 'unauthenticated')
      })

      it('answers a document the caller cannot read exactly as it answers one that does not exist', async () => {
        const { owner, outsider, member, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Private plan' } })

        const missing = await refusalOf(member.getDocument(document(crypto.randomUUID())))
        for (const stranger of [outsider, member]) {
          const hidden = await refusalOf(stranger.getDocument(document(created.id)))
          expect(hidden.status).toBe(404)
          expect(hidden.problem).toEqual(missing.problem)
        }
      })

      it('answers 404 to someone outside a workspace, whatever they ask of it', async () => {
        const { outsider, workspaceId } = await harness.scenario()

        await expectRefusal(outsider.getWorkspace(inWorkspace(workspaceId)), 'not-found')
        await expectRefusal(outsider.listDocuments(inWorkspace(workspaceId)), 'not-found')
        await expectRefusal(outsider.listMembers(inWorkspace(workspaceId)), 'not-found')
      })

      it('refuses with 403, not 404, a reader whose role does not allow the operation', async () => {
        const { owner, member, memberId, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Shared read-only' } })
        await owner.setAccess({
          params: { path: { documentId: created.id, userId: memberId } },
          body: { role: 'viewer' },
        })

        await expectRefusal(
          member.updateDocument({ ...document(created.id), body: { title: 'Renamed', revision: created.revision } }),
          'forbidden',
        )
        await expectRefusal(member.archiveDocument(document(created.id)), 'forbidden')
        await expectRefusal(member.listAccess(document(created.id)), 'forbidden')
        await expect(member.pinDocument(document(created.id))).resolves.toBeUndefined()
      })

      it('judges the shape of a request before whether its resource exists', async () => {
        const { member } = await harness.scenario()

        await expectRefusal(
          member.updateDocument({ ...document(crypto.randomUUID()), body: { title: 'x'.repeat(201), revision: 1 } }),
          'too-large',
          '/title',
        )
      })
    })

    describe('sharing', () => {
      it('shows generalAccess to the owners of a document and hides it from everyone else', async () => {
        const { owner, member, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Open to all' } })
        await owner.setGeneralAccess({ ...document(created.id), body: { generalAccess: 'commenter' } })

        const seenByOwner = await owner.getDocument(document(created.id))
        const seenByMember = await member.getDocument(document(created.id))

        expect(seenByOwner.generalAccess).toBe('commenter')
        expect(seenByMember.generalAccess).toBeNull()
        expect(seenByMember.role).toBe('commenter')
      })

      it('starts a new document private to its creator', async () => {
        const { owner, member, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Mine' } })

        expect(created.role).toBe('owner')
        expect(created.generalAccess).toBe('none')
        expect(created.revision).toBe(1)
        const listed = await member.listDocuments(inWorkspace(workspaceId))
        expect(listed.items.map((row) => row.id)).not.toContain(created.id)
      })

      it('keeps a document with at least one explicit owner', async () => {
        const { owner, ownerId, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Sole owner' } })
        const self = { params: { path: { documentId: created.id, userId: ownerId } } }

        await expectRefusal(owner.setAccess({ ...self, body: { role: 'editor' } }), 'last-owner')
        await expectRefusal(owner.removeAccess(self), 'last-owner')
      })

      it('hands the documents of a removed member to the owner who removed them', async () => {
        const { owner, ownerId, member, memberId, workspaceId } = await harness.scenario()
        const theirs = await member.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Left behind' } })

        await owner.removeMember({ params: { path: { workspaceId, userId: memberId } } })

        // The person is gone from the document; the owner still holds it, and the history says who it was handed to.
        await expectRefusal(member.getDocument(document(theirs.id)), 'not-found')
        await expect(owner.getDocument(document(theirs.id))).resolves.toMatchObject({ role: 'owner' })
        const access = await owner.listAccess(document(theirs.id))
        expect(access.items.map((entry) => entry.userId)).not.toContain(memberId)
        const { items } = await owner.listDocumentActivity(document(theirs.id))
        expect(items.find((event) => event.type === 'access.granted')?.targetUser?.id).toBe(ownerId)
      })

      it('tells only the owners of a document how it is shared', async () => {
        const { owner, member, memberId, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Quietly shared' } })
        await owner.setAccess({
          params: { path: { documentId: created.id, userId: memberId } },
          body: { role: 'editor' },
        })

        const seenByOwner = await owner.listDocumentActivity(document(created.id))
        const seenByMember = await member.listDocumentActivity(document(created.id))
        const workspaceSeenByMember = await member.listWorkspaceActivity({
          params: { path: { workspaceId }, query: { documentId: created.id } },
        })

        expect(seenByOwner.items.map((event) => event.type)).toContain('access.granted')
        expect(seenByOwner.items.find((event) => event.type === 'access.granted')?.targetUser?.id).toBe(memberId)
        expect(seenByMember.items.map((event) => event.type)).toEqual(['document.created'])
        expect(workspaceSeenByMember.items.map((event) => event.type)).toEqual(['document.created'])
      })

      it('records one access.granted event for each document handed over', async () => {
        const { owner, ownerId, member, memberId, workspaceId } = await harness.scenario()
        const theirs = await member.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Handed over' } })

        await owner.removeMember({ params: { path: { workspaceId, userId: memberId } } })

        const { items } = await owner.listDocumentActivity(document(theirs.id))
        const handOvers = items.filter((event) => event.type === 'access.granted')
        expect(handOvers).toHaveLength(1)
        expect(handOvers[0]).toMatchObject({ actor: { id: ownerId }, targetUser: { id: ownerId } })
      })

      it('keeps a workspace with an owner', async () => {
        const { owner, ownerId, workspaceId } = await harness.scenario()

        await expectRefusal(owner.removeMember({ params: { path: { workspaceId, userId: ownerId } } }), 'last-owner')
        await expectRefusal(
          owner.updateMember({ params: { path: { workspaceId, userId: ownerId } }, body: { role: 'member' } }),
          'last-owner',
        )
      })

      it('adds a person by email as pending, once', async () => {
        const { owner, workspaceId } = await harness.scenario()
        const email = `${unique()}@suite.example`

        const added = await owner.addMember({ ...inWorkspace(workspaceId), body: { email, role: 'member' } })

        expect(added).toMatchObject({ email, status: 'pending', name: null, role: 'member' })
        await expectRefusal(
          owner.addMember({ ...inWorkspace(workspaceId), body: { email, role: 'member' } }),
          'conflict',
        )
      })
    })

    describe('lists', () => {
      it('pages a list newest first with the id as tie-breaker, without repeating or skipping a row', async () => {
        const { owner, workspaceId } = await harness.scenario()
        const created = await Promise.all(
          Array.from({ length: 7 }, (_, index) =>
            owner.createDocument({ ...inWorkspace(workspaceId), body: { title: `Page test ${index}` } }),
          ),
        )

        const seen: Document[] = []
        let cursor: string | undefined
        do {
          const page = await owner.listDocuments({
            params: { path: { workspaceId }, query: { limit: 3, ...(cursor === undefined ? {} : { cursor }) } },
          })
          expect(page.items.length).toBeLessThanOrEqual(3)
          seen.push(...page.items)
          cursor = page.nextCursor ?? undefined
        } while (cursor !== undefined)

        const ids = seen.map((row) => row.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect(ids).toEqual(expect.arrayContaining(created.map((row) => row.id)))
        expect(isNewestFirst(seen.map((row) => ({ instant: row.updatedAt, id: row.id })))).toBe(true)
      })

      it('says there is no next page when everything fits in one', async () => {
        const { owner, workspaceId } = await harness.scenario()

        const page = await owner.listDocuments({ params: { path: { workspaceId }, query: { limit: 100 } } })

        expect(page.nextCursor).toBeNull()
      })

      it.each([[0], [101], [-1], [1.5]])('refuses a limit of %s', async (limit) => {
        const { owner, workspaceId } = await harness.scenario()

        await expectRefusal(
          owner.listDocuments({ params: { path: { workspaceId }, query: { limit } } }),
          'validation-failed',
          '/query/limit',
        )
      })

      it('refuses a cursor that was not issued, and one used with other filters', async () => {
        const { owner, workspaceId } = await harness.scenario()
        await Promise.all(
          ['A', 'B', 'C'].map((title) => owner.createDocument({ ...inWorkspace(workspaceId), body: { title } })),
        )
        const first = await owner.listDocuments({ params: { path: { workspaceId }, query: { limit: 1 } } })

        await expectRefusal(
          owner.listDocuments({ params: { path: { workspaceId }, query: { cursor: 'not-a-cursor' } } }),
          'validation-failed',
          '/query/cursor',
        )
        await expectRefusal(
          owner.listDocuments({
            params: { path: { workspaceId }, query: { limit: 1, archived: true, cursor: first.nextCursor ?? '' } },
          }),
          'validation-failed',
          '/query/cursor',
        )
      })

      it('pages the versions of a document', async () => {
        const { owner, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Versioned' } })
        for (const label of ['One', 'Two', 'Three']) {
          await owner.createVersion({ ...document(created.id), body: { label } })
        }

        const first = await owner.listVersions({ params: { path: { documentId: created.id }, query: { limit: 2 } } })
        const second = await owner.listVersions({
          params: { path: { documentId: created.id }, query: { limit: 2, cursor: first.nextCursor ?? '' } },
        })

        expect(first.items).toHaveLength(2)
        expect(second.items).toHaveLength(1)
        expect(second.nextCursor).toBeNull()
        expect([...first.items, ...second.items].map((row) => row.label)).toEqual(['Three', 'Two', 'One'])
      })

      it('lists folders by name, with the id as tie-breaker', async () => {
        const { owner, workspaceId } = await harness.scenario()
        const prefix = unique()
        const created = await Promise.all(
          [`${prefix} Beta`, `${prefix} Alpha`, `${prefix} Beta`].map((name) =>
            owner.createFolder({ ...inWorkspace(workspaceId), body: { name } }),
          ),
        )

        // Only the folders this test made: how the server collates the names of the others is its own business.
        const { items } = await owner.listFolders(inWorkspace(workspaceId))

        const mine = items.filter((folder) => created.some((row) => row.id === folder.id))
        const [beta1, beta2] = created.filter((row) => row.name.endsWith('Beta')).sort((a, b) => (a.id < b.id ? -1 : 1))
        expect(mine.map((folder) => folder.name.slice(prefix.length + 1))).toEqual(['Alpha', 'Beta', 'Beta'])
        expect(mine.slice(1).map((folder) => folder.id)).toEqual([beta1?.id, beta2?.id])
      })
    })

    describe('revisions', () => {
      it('grows by one with every change to the title and answers a stale one with the current document', async () => {
        const { owner, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'First' } })
        const renamed = await owner.updateDocument({
          ...document(created.id),
          body: { title: 'Second', revision: created.revision },
        })

        const stale = await refusalOf(
          owner.updateDocument({ ...document(created.id), body: { title: 'Third', revision: created.revision } }),
        )

        expect(renamed.revision).toBe(created.revision + 1)
        expect(stale).toMatchObject({
          status: 409,
          code: 'revision-conflict',
          problem: { current: { title: 'Second' } },
        })
      })

      it('moves a document in and out of a folder, and refuses a folder that is not there', async () => {
        const { owner, workspaceId } = await harness.scenario()
        const folder = await owner.createFolder({ ...inWorkspace(workspaceId), body: { name: 'Plans' } })
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Movable' } })

        const inside = await owner.updateDocument({
          ...document(created.id),
          body: { folderId: folder.id, revision: created.revision },
        })
        const outside = await owner.updateDocument({
          ...document(created.id),
          body: { folderId: null, revision: inside.revision },
        })

        expect(inside.folderId).toBe(folder.id)
        expect(outside.folderId).toBeNull()
        await expectRefusal(
          owner.updateDocument({
            ...document(created.id),
            body: { folderId: crypto.randomUUID(), revision: outside.revision },
          }),
          'validation-failed',
          '/folderId',
        )
      })

      it('answers a stale folder revision with the current folder', async () => {
        const { owner, workspaceId } = await harness.scenario()
        const folder = await owner.createFolder({ ...inWorkspace(workspaceId), body: { name: 'Drafts' } })
        await owner.updateFolder({
          params: { path: { folderId: folder.id } },
          body: { name: 'Drafts 2', revision: folder.revision },
        })

        await expect(
          refusalOf(
            owner.updateFolder({
              params: { path: { folderId: folder.id } },
              body: { name: 'Drafts 3', revision: folder.revision },
            }),
          ),
        ).resolves.toMatchObject({ code: 'revision-conflict', problem: { current: { name: 'Drafts 2' } } })
      })

      it('archives and restores without changing anything the second time', async () => {
        const { owner, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Archivable' } })

        const archived = await owner.archiveDocument(document(created.id))
        const again = await owner.archiveDocument(document(created.id))
        const restored = await owner.restoreDocument(document(created.id))

        expect(archived.archivedAt).not.toBeNull()
        expect(again.revision).toBe(archived.revision)
        expect(restored.archivedAt).toBeNull()
        expect(restored.revision).toBe(archived.revision + 1)
      })
    })

    describe('limits', () => {
      it('counts a title in Unicode code points, not UTF-16 units', async () => {
        const { owner, workspaceId } = await harness.scenario()

        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: emoji(150) } })

        expect(created.title).toBe(emoji(150))
      })

      it.each([
        [
          'a title over 200 code points',
          (suite: Scenario) =>
            suite.owner.createDocument({ ...inWorkspace(suite.workspaceId), body: { title: emoji(201) } }),
          '/title',
        ],
        [
          'a folder name over 80',
          (suite: Scenario) =>
            suite.owner.createFolder({ ...inWorkspace(suite.workspaceId), body: { name: 'f'.repeat(81) } }),
          '/name',
        ],
        [
          'a workspace name over 80',
          (suite: Scenario) =>
            suite.owner.updateWorkspace({ ...inWorkspace(suite.workspaceId), body: { name: 'w'.repeat(81) } }),
          '/name',
        ],
      ])('answers %s with 413 and the field', async (_name, call, pointer) => {
        const suite = await harness.scenario()

        await expectRefusal(call(suite), 'too-large', pointer)
      })

      it('answers an empty title with 400, not 413', async () => {
        const { owner, workspaceId } = await harness.scenario()

        await expectRefusal(
          owner.createDocument({ ...inWorkspace(workspaceId), body: { title: '' } }),
          'validation-failed',
          '/title',
        )
      })

      it('refuses a search over 200 code points with 400, since it is a parameter and not a body', async () => {
        const { owner, workspaceId } = await harness.scenario()

        await expectRefusal(
          owner.listDocuments({ params: { path: { workspaceId }, query: { query: 'q'.repeat(201) } } }),
          'validation-failed',
          '/query/query',
        )
      })

      it('answers a comment over 5000 code points with 413', async () => {
        const { owner, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Commented' } })

        await expectRefusal(
          owner.createThread({
            ...document(created.id),
            body: { anchor: { start: 'AQ==', end: 'Ag==' }, quote: 'text', body: 'c'.repeat(5001) },
          }),
          'too-large',
          '/body',
        )
      })
    })

    describe('documents', () => {
      it('keeps an archived document from everyone but its owners until it is restored', async () => {
        const { owner, member, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Soon archived' } })
        await owner.setGeneralAccess({ ...document(created.id), body: { generalAccess: 'viewer' } })
        await member.getDocument(document(created.id))

        await owner.archiveDocument(document(created.id))

        await expectRefusal(member.getDocument(document(created.id)), 'not-found')
        const live = await owner.listDocuments(inWorkspace(workspaceId))
        const archived = await owner.listDocuments({ params: { path: { workspaceId }, query: { archived: true } } })
        expect(live.items.map((row) => row.id)).not.toContain(created.id)
        expect(archived.items.map((row) => row.id)).toContain(created.id)
      })

      it('deletes only what is archived', async () => {
        const { owner, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Deletable' } })

        await expectRefusal(owner.deleteDocument(document(created.id)), 'conflict')
        await owner.archiveDocument(document(created.id))
        await owner.deleteDocument(document(created.id))

        await expectRefusal(owner.getDocument(document(created.id)), 'not-found')
      })

      it('refuses to delete a folder that still holds a document', async () => {
        const { owner, workspaceId } = await harness.scenario()
        const folder = await owner.createFolder({ ...inWorkspace(workspaceId), body: { name: 'Occupied' } })
        await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Inside', folderId: folder.id } })

        await expectRefusal(owner.deleteFolder({ params: { path: { folderId: folder.id } } }), 'conflict')
      })

      it('refuses a folder that does not exist when creating a document', async () => {
        const { owner, workspaceId } = await harness.scenario()

        await expectRefusal(
          owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Lost', folderId: crypto.randomUUID() } }),
          'validation-failed',
          '/folderId',
        )
      })

      it('asks for a template when a language is given', async () => {
        const { owner, workspaceId } = await harness.scenario()

        await expectRefusal(
          owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'No template', locale: 'es' } }),
          'validation-failed',
          '/templateId',
        )
      })

      it('lists the templates in the language that was asked for', async () => {
        const { owner } = await harness.scenario()

        const english = await owner.listTemplates()
        const spanish = await owner.listTemplates({ params: { query: { locale: 'es' } } })

        expect(english.items.map((row) => row.id)).toEqual(spanish.items.map((row) => row.id))
        expect(english.items.map((row) => row.name)).not.toEqual(spanish.items.map((row) => row.name))
      })

      it('lets people pin and unpin a document more than once', async () => {
        const { owner, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Pinned' } })

        await owner.pinDocument(document(created.id))
        await owner.pinDocument(document(created.id))
        const pinned = await owner.listPinnedDocuments(inWorkspace(workspaceId))
        await owner.unpinDocument(document(created.id))
        await owner.unpinDocument(document(created.id))
        const unpinned = await owner.listPinnedDocuments(inWorkspace(workspaceId))

        expect(pinned.items.filter((row) => row.id === created.id)).toHaveLength(1)
        expect(unpinned.items.map((row) => row.id)).not.toContain(created.id)
      })
    })

    describe('comments', () => {
      const anchor = { start: 'AQ==', end: 'Ag==' }

      it('lets only the author edit a comment, and a document owner delete anyone’s', async () => {
        const { owner, member, memberId, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Discussed' } })
        await owner.setAccess({
          params: { path: { documentId: created.id, userId: memberId } },
          body: { role: 'commenter' },
        })
        const thread = await owner.createThread({
          ...document(created.id),
          body: { anchor, quote: 'text', body: 'Mine' },
        })
        const reply = await member.replyToThread({
          params: { path: { threadId: thread.id } },
          body: { body: 'Theirs' },
        })
        const ownerComment = thread.comments[0]?.id ?? ''

        await expectRefusal(
          member.updateComment({ params: { path: { commentId: ownerComment } }, body: { body: 'Hijacked' } }),
          'forbidden',
        )
        await expectRefusal(member.deleteComment({ params: { path: { commentId: ownerComment } } }), 'forbidden')
        await owner.deleteComment({ params: { path: { commentId: reply.id } } })

        const left = await owner.listThreads(document(created.id))
        expect(left.items[0]?.comments.map((comment) => comment.id)).toEqual([ownerComment])
      })

      it('removes a thread together with its last comment', async () => {
        const { owner, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Short thread' } })
        const thread = await owner.createThread({ ...document(created.id), body: { anchor, quote: 'q', body: 'Only' } })

        await owner.deleteComment({ params: { path: { commentId: thread.comments[0]?.id ?? '' } } })

        expect((await owner.listThreads(document(created.id))).items).toEqual([])
      })

      it('lets a viewer read the comments but not write one', async () => {
        const { owner, member, memberId, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Read only' } })
        await owner.setAccess({
          params: { path: { documentId: created.id, userId: memberId } },
          body: { role: 'viewer' },
        })

        await expect(member.listThreads(document(created.id))).resolves.toEqual({ items: [] })
        await expectRefusal(
          member.createThread({ ...document(created.id), body: { anchor, quote: 'q', body: 'Not allowed' } }),
          'forbidden',
        )
      })

      it('resolves and reopens a thread any number of times', async () => {
        const { owner, workspaceId } = await harness.scenario()
        const created = await owner.createDocument({ ...inWorkspace(workspaceId), body: { title: 'Resolvable' } })
        const thread = await owner.createThread({ ...document(created.id), body: { anchor, quote: 'q', body: 'Open' } })
        const target = { params: { path: { threadId: thread.id } } }

        const first = await owner.resolveThread(target)
        const second = await owner.resolveThread(target)
        const reopened = await owner.reopenThread(target)

        expect([first.status, second.status, reopened.status]).toEqual(['resolved', 'resolved', 'open'])
        expect(second.resolvedAt).toBe(first.resolvedAt)
      })
    })
  })
}
