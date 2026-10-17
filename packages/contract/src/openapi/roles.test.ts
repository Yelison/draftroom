import { describe, expect, it } from 'vitest'
import { asSchema, loadOpenApi, restrictionOf } from './document.ts'

const document = loadOpenApi()
const { operations, schemas } = document

const everyone = ['viewer', 'commenter', 'editor', 'owner']
const commenters = ['commenter', 'editor', 'owner']
const editors = ['editor', 'owner']
const owners = ['owner']
const members = ['member', 'owner']

// Plan §4.3, row by row. Document rows list effective document roles; workspace rows list workspace roles.
const matrix: Record<string, { scope: 'document' | 'workspace'; roles: string[] }> = {
  read: { scope: 'document', roles: everyone },
  'write-content': { scope: 'document', roles: editors },
  'read-comments': { scope: 'document', roles: everyone },
  'write-comments': { scope: 'document', roles: commenters },
  'edit-own-comment': { scope: 'document', roles: commenters },
  'delete-any-comment': { scope: 'document', roles: owners },
  'rename-move': { scope: 'document', roles: editors },
  'create-version': { scope: 'document', roles: editors },
  'read-versions': { scope: 'document', roles: everyone },
  'restore-version': { scope: 'document', roles: owners },
  'manage-access': { scope: 'document', roles: owners },
  'archive-delete': { scope: 'document', roles: owners },
  pin: { scope: 'document', roles: everyone },
  'workspace-read': { scope: 'workspace', roles: members },
  'create-content': { scope: 'workspace', roles: members },
  'rename-folder': { scope: 'workspace', roles: members },
  'delete-folder': { scope: 'workspace', roles: owners },
  'manage-members': { scope: 'workspace', roles: owners },
  'rename-workspace': { scope: 'workspace', roles: owners },
}

// Writing content happens over the collaboration connection, which has no REST operation (docs/collab/protocol.md).
const websocketOnlyRows = ['write-content']

// operationId, scope, then the rows it falls under; `row:author` marks a rule that only applies to the author.
const operationAccess: [string, string, string[]][] = [
  ['getMe', 'session', []],
  ['updateMe', 'session', []],
  ['signUp', 'public', []],
  ['signIn', 'public', []],
  ['signOut', 'session', []],
  ['listWorkspaces', 'session', []],
  ['getWorkspace', 'workspace', ['workspace-read']],
  ['updateWorkspace', 'workspace', ['rename-workspace']],
  ['listMembers', 'workspace', ['workspace-read']],
  ['addMember', 'workspace', ['manage-members']],
  ['updateMember', 'workspace', ['manage-members']],
  ['removeMember', 'workspace', ['manage-members']],
  ['listFolders', 'workspace', ['workspace-read']],
  ['createFolder', 'workspace', ['create-content']],
  ['updateFolder', 'workspace', ['rename-folder']],
  ['deleteFolder', 'workspace', ['delete-folder']],
  ['listDocuments', 'workspace', ['workspace-read']],
  ['createDocument', 'workspace', ['create-content']],
  ['getDocument', 'document', ['read']],
  ['updateDocument', 'document', ['rename-move']],
  ['archiveDocument', 'document', ['archive-delete']],
  ['restoreDocument', 'document', ['archive-delete']],
  ['deleteDocument', 'document', ['archive-delete']],
  ['pinDocument', 'document', ['pin']],
  ['unpinDocument', 'document', ['pin']],
  ['listPinnedDocuments', 'workspace', ['workspace-read']],
  ['listSharedDocuments', 'workspace', ['workspace-read']],
  ['listAccess', 'document', ['manage-access']],
  ['setAccess', 'document', ['manage-access']],
  ['removeAccess', 'document', ['manage-access']],
  ['setGeneralAccess', 'document', ['manage-access']],
  ['listThreads', 'document', ['read-comments']],
  ['createThread', 'document', ['write-comments']],
  ['replyToThread', 'document', ['write-comments']],
  ['resolveThread', 'document', ['write-comments']],
  ['reopenThread', 'document', ['write-comments']],
  ['updateComment', 'document', ['edit-own-comment:author']],
  ['deleteComment', 'document', ['edit-own-comment:author', 'delete-any-comment']],
  ['listVersions', 'document', ['read-versions']],
  ['createVersion', 'document', ['create-version']],
  ['getVersionContent', 'document', ['read-versions']],
  ['restoreVersion', 'document', ['restore-version']],
  ['listWorkspaceActivity', 'workspace', ['workspace-read']],
  ['listDocumentActivity', 'document', ['read']],
  ['listTemplates', 'session', []],
  ['getLiveness', 'public', []],
  ['getReadiness', 'public', []],
]

const rulesOf = (operation: (typeof operations)[number]) => operation.access?.rules ?? []

describe('roles', () => {
  it('state a scope on every operation', () => {
    const unscoped = operations.filter(
      (operation) => !['public', 'session', 'document', 'workspace'].includes(operation.access?.scope ?? ''),
    )

    expect(unscoped.map((operation) => operation.key)).toEqual([])
  })

  it('list rules for operations that depend on a role, and none for the rest', () => {
    const inconsistent = operations.filter((operation) => {
      const rolebased = operation.access?.scope === 'document' || operation.access?.scope === 'workspace'
      return rolebased === (rulesOf(operation).length === 0)
    })

    expect(inconsistent.map((operation) => operation.key)).toEqual([])
  })

  it('give every rule the roles of its row in the matrix', () => {
    const offenders = operations.flatMap((operation) =>
      rulesOf(operation)
        .filter((rule) => JSON.stringify(rule.roles) !== JSON.stringify(matrix[rule.row]?.roles))
        .map((rule) => `${operation.id}: ${rule.row} has ${rule.roles.join()}`),
    )

    expect(offenders).toEqual([])
  })

  it('keep a rule in the scope of its row', () => {
    const offenders = operations.flatMap((operation) =>
      rulesOf(operation)
        .filter((rule) => matrix[rule.row]?.scope !== operation.access?.scope)
        .map((rule) => `${operation.id}: ${rule.row}`),
    )

    expect(offenders).toEqual([])
  })

  it('reach every row of the matrix through some operation, but content writes', () => {
    const used = new Set(operations.flatMap((operation) => rulesOf(operation).map((rule) => rule.row)))
    const unreached = Object.keys(matrix).filter((row) => !used.has(row))

    expect(unreached).toEqual(websocketOnlyRows)
  })

  it('reserve the author condition for the comment rules', () => {
    const conditions = operations.flatMap((operation) =>
      rulesOf(operation)
        .filter((rule) => rule.condition !== undefined)
        .map((rule) => `${rule.row}:${rule.condition}`),
    )

    expect([...new Set(conditions)]).toEqual(['edit-own-comment:author'])
  })

  describe('by operation', () => {
    it.each(operationAccess)('%s is %s-scoped under %j', (id, scope, rows) => {
      const operation = operations.find((candidate) => candidate.id === id)
      if (operation === undefined) throw new Error(`The contract has no operation ${id}`)

      const found = rulesOf(operation).map((rule) =>
        rule.condition === undefined ? rule.row : `${rule.row}:${rule.condition}`,
      )

      expect([operation.access?.scope, found]).toEqual([scope, rows])
    })

    it('cover every operation of the contract', () => {
      expect(operationAccess.map(([id]) => id).sort()).toEqual(operations.map((operation) => operation.id).sort())
    })
  })

  // The matrix gives the sharing settings to owners alone, and the data must not leave through other operations.
  describe('sharing data', () => {
    const accessOwners = matrix['manage-access']?.roles

    it('keeps the general access of a document for its owners', () => {
      const property = schemas['Document']?.properties?.['generalAccess']

      expect([document.alternativesOf(property), restrictionOf(property)?.visibleTo]).toEqual([
        ['GeneralAccess', 'null'],
        accessOwners,
      ])
    })

    it('keeps every event that reveals how a document is shared for its owners', () => {
      const event = schemas['ActivityEvent']
      const revealing = (asSchema(schemas['ActivityType']).enum ?? []).filter(
        (type) => typeof type === 'string' && (type.startsWith('access.') || type.startsWith('general-access.')),
      )

      expect([restrictionOf(event)?.types, restrictionOf(event)?.visibleTo]).toEqual([revealing, accessOwners])
    })
  })

  describe('last owner', () => {
    const description = (id: string) => operations.find((operation) => operation.id === id)?.description ?? ''

    it.each(['setAccess', 'removeAccess'])('is one explicit owner grant per document in %s', (id) => {
      expect(description(id)).toContain('explicit owner grant')
    })

    it('hands the documents of a removed member to the workspace owner instead of blocking', () => {
      expect(description('removeMember')).toContain('transferred to the workspace owner who makes the request')
      expect(description('removeMember')).toContain('`access.granted` event is recorded per document')
    })
  })
})
