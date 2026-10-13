import { describe, expect, it } from 'vitest'
import { loadOpenApi } from './document.ts'

const { operations } = loadOpenApi()

// The table of plan §4.1, one entry per operation. A forgotten or invented operation fails here first.
const planOperations = [
  'GET /api/me',
  'POST /api/auth/sign-up',
  'POST /api/auth/sign-in',
  'POST /api/auth/sign-out',
  'GET /api/workspaces',
  'GET /api/workspaces/{workspaceId}',
  'PATCH /api/workspaces/{workspaceId}',
  'GET /api/workspaces/{workspaceId}/members',
  'POST /api/workspaces/{workspaceId}/members',
  'PATCH /api/workspaces/{workspaceId}/members/{userId}',
  'DELETE /api/workspaces/{workspaceId}/members/{userId}',
  'GET /api/workspaces/{workspaceId}/folders',
  'POST /api/workspaces/{workspaceId}/folders',
  'PATCH /api/folders/{folderId}',
  'DELETE /api/folders/{folderId}',
  'GET /api/workspaces/{workspaceId}/documents',
  'POST /api/workspaces/{workspaceId}/documents',
  'GET /api/documents/{documentId}',
  'PATCH /api/documents/{documentId}',
  'POST /api/documents/{documentId}/archive',
  'POST /api/documents/{documentId}/restore',
  'DELETE /api/documents/{documentId}',
  'PUT /api/documents/{documentId}/pin',
  'DELETE /api/documents/{documentId}/pin',
  'GET /api/workspaces/{workspaceId}/pinned',
  'GET /api/workspaces/{workspaceId}/shared',
  'GET /api/documents/{documentId}/access',
  'PUT /api/documents/{documentId}/access/{userId}',
  'DELETE /api/documents/{documentId}/access/{userId}',
  'PUT /api/documents/{documentId}/general-access',
  'GET /api/documents/{documentId}/threads',
  'POST /api/documents/{documentId}/threads',
  'POST /api/threads/{threadId}/replies',
  'POST /api/threads/{threadId}/resolve',
  'POST /api/threads/{threadId}/reopen',
  'PATCH /api/comments/{commentId}',
  'DELETE /api/comments/{commentId}',
  'GET /api/documents/{documentId}/versions',
  'POST /api/documents/{documentId}/versions',
  'GET /api/versions/{versionId}/content',
  'POST /api/versions/{versionId}/restore',
  'GET /api/workspaces/{workspaceId}/activity',
  'GET /api/documents/{documentId}/activity',
  'GET /api/templates',
  'GET /api/health/live',
  'GET /api/health/ready',
]

describe('operations', () => {
  it('cover exactly the operations of the plan', () => {
    expect(operations.map((operation) => operation.key).sort()).toEqual([...planOperations].sort())
  })

  it('each have an operationId', () => {
    const missing = operations.filter((operation) => operation.id === undefined).map((operation) => operation.key)

    expect(missing).toEqual([])
  })

  it('never share an operationId', () => {
    const ids = operations.map((operation) => operation.id)
    const repeated = ids.filter((id, index) => ids.indexOf(id) !== index)

    expect(repeated).toEqual([])
  })

  it('name their operationId in camelCase English', () => {
    const misnamed = operations.map((operation) => operation.id ?? '').filter((id) => !/^[a-z][a-zA-Z0-9]*$/.test(id))

    expect(misnamed).toEqual([])
  })

  it('serve content only as JSON, except the version download', () => {
    const mediaTypes = operations.flatMap((operation) =>
      Object.values(operation.responses).flatMap((candidate) =>
        '$ref' in candidate ? [] : Object.keys(candidate.content ?? {}).map((type) => `${operation.id}: ${type}`),
      ),
    )

    expect(mediaTypes.filter((entry) => !entry.endsWith(': application/json'))).toEqual([
      'getVersionContent: application/octet-stream',
    ])
  })
})
