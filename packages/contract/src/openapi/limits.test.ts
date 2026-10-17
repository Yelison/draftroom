import { describe, expect, it } from 'vitest'
import { contractLimits } from '../rest.ts'
import { asSchema, loadOpenApi } from './document.ts'

const document = loadOpenApi()
const { operations, schemas } = document

// Plan §4.1: title 1–200, comment body 1–5 000, quote ≤ 500, folder name 1–80. The workspace name and the version label
// are not in the plan; they follow the folder name and a short label.
const limited = [
  ['DocumentTitle', contractLimits.documentTitle, 1, 200],
  ['CommentBody', contractLimits.commentBody, 1, 5000],
  ['Quote', contractLimits.quote, 1, 500],
  ['FolderName', contractLimits.folderName, 1, 80],
  ['WorkspaceName', contractLimits.workspaceName, 1, 80],
  ['VersionLabel', contractLimits.versionLabel, 1, 100],
] as const

// Every request field that carries a limited text, with the schema that bounds it.
const limitedFields = [
  ['CreateDocumentRequest', 'title', 'DocumentTitle'],
  ['UpdateDocumentRequest', 'title', 'DocumentTitle'],
  ['CreateFolderRequest', 'name', 'FolderName'],
  ['UpdateFolderRequest', 'name', 'FolderName'],
  ['UpdateWorkspaceRequest', 'name', 'WorkspaceName'],
  ['UpdateMeRequest', 'name', 'PersonName'],
  ['CreateThreadRequest', 'body', 'CommentBody'],
  ['CreateThreadRequest', 'quote', 'Quote'],
  ['CreateCommentRequest', 'body', 'CommentBody'],
  ['UpdateCommentRequest', 'body', 'CommentBody'],
  ['CreateVersionRequest', 'label', 'VersionLabel'],
] as const

const schemaNamed = (name: string) => {
  const schema = schemas[name]
  if (schema === undefined) throw new Error(`The contract has no schema ${name}`)
  return schema
}

describe('length limits', () => {
  it.each(limited)('bound %s', (name, _constant, min, max) => {
    expect([schemaNamed(name).minLength, schemaNamed(name).maxLength]).toEqual([min, max])
  })

  it.each(limited)('are exported for %s with the same figures', (name, constant, min, max) => {
    expect([name, constant]).toEqual([name, { min, max }])
  })

  it.each(limitedFields)('apply to %s.%s through %s', (request, property, limit) => {
    expect(document.referencedName(schemaNamed(request).properties?.[property])).toBe(limit)
  })

  // The rule is by location: a text in the body over its maximum is 413, while query and path parameters are always 400.
  it('are answered with 413 by every operation whose body bounds a text', () => {
    const boundsText = (node: unknown): boolean => {
      if (node === undefined) return false
      const name = document.referencedName(node)
      const schema = asSchema(name === undefined ? node : schemas[name])
      return schema.maxLength !== undefined || Object.values(schema.properties ?? {}).some(boundsText)
    }
    const carriers = operations.filter((operation) =>
      boundsText(operation.requestBody?.content?.['application/json']?.schema),
    )
    const without = carriers.filter((operation) => operation.responses['413'] === undefined)

    expect({
      carriers: carriers.map((operation) => operation.id).sort(),
      without: without.map((operation) => operation.id),
    }).toEqual({
      carriers: [
        'addMember',
        'createDocument',
        'createFolder',
        'createThread',
        'createVersion',
        'replyToThread',
        'signIn',
        'signUp',
        'updateComment',
        'updateDocument',
        'updateFolder',
        'updateMe',
        'updateWorkspace',
      ],
      without: [],
    })
  })

  // A limit written inline would stay behind when the named schema changes: a name valid at sign-up must stay valid when
  // listed, and the other way round.
  it.each([
    ['User', 'name', ['PersonName']],
    ['Me', 'name', ['PersonName']],
    ['UserRef', 'name', ['PersonName']],
    ['SignUpRequest', 'name', ['PersonName']],
    ['Member', 'name', ['PersonName', 'null']],
    ['AccessEntry', 'name', ['PersonName', 'null']],
    ['Version', 'label', ['VersionLabel', 'null']],
  ])('take %s.%s from the named schema', (schema, property, expected) => {
    const node = schemaNamed(schema).properties?.[property]
    const found = expected.includes('null') ? document.alternativesOf(node) : [document.referencedName(node)]

    expect(found).toEqual(expected)
  })

  // Signing in accepts whatever sign-up could have stored, no more: the maximum is the one of `Password`.
  it('let sign-in take passwords as long as sign-up allows', () => {
    const signIn = asSchema(schemaNamed('SignInRequest').properties?.['password'])

    expect(signIn.maxLength).toBe(schemaNamed('Password').maxLength)
  })
})

describe('pagination', () => {
  it('defaults to 25 items and allows 100 at most', () => {
    const limit = asSchema(document.parameters['Limit']?.schema)

    expect([limit.minimum, limit.maximum, limit.default]).toEqual([
      1,
      contractLimits.page.maxSize,
      contractLimits.page.defaultSize,
    ])
    expect([contractLimits.page.defaultSize, contractLimits.page.maxSize]).toEqual([25, 100])
  })

  it('offers a cursor and a limit together, on the four paginated lists only', () => {
    const takes = (operation: (typeof operations)[number], name: string) =>
      operation.parameters.some((parameter) => document.referencedName(parameter) === name)
    const paginated = operations.filter((operation) => takes(operation, 'Cursor'))

    expect(paginated.map((operation) => operation.id).sort()).toEqual([
      'listDocumentActivity',
      'listDocuments',
      'listVersions',
      'listWorkspaceActivity',
    ])
    expect(paginated.filter((operation) => !takes(operation, 'Limit'))).toEqual([])
  })

  it.each([
    ['listDocuments', 'DocumentPage'],
    ['listVersions', 'VersionPage'],
    ['listWorkspaceActivity', 'ActivityPage'],
    ['listDocumentActivity', 'ActivityPage'],
  ])('answers %s with its page, %s', (id, page) => {
    const success = operations.find((operation) => operation.id === id)?.responses['200']
    const body = success === undefined || '$ref' in success ? undefined : success.content?.['application/json']?.schema

    expect(document.referencedName(body)).toBe(page)
  })

  it('returns nextCursor on every page, null on the last one', () => {
    const pages = Object.entries(schemas).filter(([name]) => name.endsWith('Page'))

    expect(pages.map(([name]) => name).sort()).toEqual(['ActivityPage', 'DocumentPage', 'VersionPage'])
    expect(pages.filter(([, page]) => !page.required?.includes('nextCursor')).map(([name]) => name)).toEqual([])
    expect(schemaNamed('NextCursor').type).toEqual(['string', 'null'])
  })
})

describe('optimistic concurrency', () => {
  it.each(['Document', 'Folder'])('shows the revision in every %s', (name) => {
    expect(schemaNamed(name).required).toContain('revision')
  })

  it.each(['UpdateDocumentRequest', 'UpdateFolderRequest'])('requires the revision in %s', (name) => {
    expect(schemaNamed(name).required).toContain('revision')
  })

  it('numbers revisions from 1', () => {
    expect([schemaNamed('Revision').type, schemaNamed('Revision').minimum]).toEqual(['integer', 1])
  })

  it.each([
    ['DocumentRevisionConflict', 'Document', 'updateDocument'],
    ['FolderRevisionConflict', 'Folder', 'updateFolder'],
  ])('answers a stale revision with the current resource (%s)', (name, resource, operationId) => {
    const conflict = operations.find((operation) => operation.id === operationId)?.responses['409']

    expect([
      schemaNamed(name).required,
      document.referencedName(schemaNamed(name).properties?.['current']),
      conflict !== undefined && '$ref' in conflict ? conflict.$ref : undefined,
    ]).toEqual([
      expect.arrayContaining(['code', 'current']),
      resource,
      name === 'DocumentRevisionConflict'
        ? '#/components/responses/DocumentStale'
        : '#/components/responses/FolderStale',
    ])
  })
})

describe('error codes', () => {
  it('are the only ones a problem can carry', () => {
    expect(document.referencedName(schemaNamed('Problem').properties?.['code'])).toBe('ErrorCode')
  })

  it('are the stable set of the plan plus the two server-side ones', () => {
    expect(schemaNamed('ErrorCode').enum).toEqual([
      'validation-failed',
      'not-found',
      'forbidden',
      'unauthenticated',
      'csrf',
      'revision-conflict',
      'last-owner',
      'rate-limited',
      'too-large',
      'conflict',
      'internal-error',
      'unavailable',
    ])
  })
})
