import type { paths } from '@draftroom/contract'
import createClient, { type ClientOptions } from 'openapi-fetch'
import type { DataSource } from '../DataSource.ts'
import { TransportError } from '../errors.ts'
import { changesState, csrfHeaderName, csrfTokenFromCookie } from './csrf.ts'
import { failureOf } from './problem.ts'

export interface HttpDataSourceOptions {
  /** Where the API lives. The paths of the contract already start with `/api`, so the default is the app's own origin. */
  baseUrl?: string
  /** The transport, for tests; the browser's `fetch` by default. */
  fetch?: ClientOptions['fetch']
  /** The CSRF token to echo; the `dr_csrf` cookie by default. */
  csrfToken?: () => string | undefined
}

interface Answer<Data> {
  data?: Data | undefined
  error?: unknown
  response: Response
}

/** The one operation whose success is not JSON: the download of a version is a Yjs update. */
const download: keyof paths = '/api/versions/{versionId}/content'

/**
 * What `openapi-fetch` answers, with whatever it throws made a `TransportError`. It only routes a failed `fetch` through
 * the middleware, so a body that claims to be JSON and is not (a response cut short) escapes as a `SyntaxError`, which
 * is not an answer of the contract either. There is no response to take a status from, so that one has none.
 */
async function answered<Data>(call: Promise<Answer<Data>>): Promise<Answer<Data>> {
  try {
    return await call
  } catch (error) {
    throw error instanceof TransportError ? error : new TransportError(null, { cause: error })
  }
}

/** The body of a successful call; any other answer becomes the error the contract or the transport defines. */
async function data<Data>(call: Promise<Answer<Data>>): Promise<Data> {
  const { data: body, error, response } = await answered(call)
  if (!response.ok || body === undefined) throw failureOf(response, error)
  return body
}

/** A successful call without a body (`204`). */
async function empty(call: Promise<Answer<undefined>>): Promise<void> {
  const { error, response } = await answered(call)
  if (!response.ok) throw failureOf(response, error)
}

async function bytes(call: Promise<Answer<ArrayBuffer>>): Promise<Uint8Array> {
  return new Uint8Array(await data(call))
}

/**
 * Talks to the server over REST, with the session cookie and the CSRF token the contract asks for. The types come from
 * the generated `paths`, so a call that does not match `openapi.yaml` does not compile.
 */
export function createHttpDataSource({
  baseUrl = '',
  fetch,
  csrfToken = csrfTokenFromCookie,
}: HttpDataSourceOptions = {}): DataSource {
  const client = createClient<paths>({
    baseUrl,
    credentials: 'include',
    ...(fetch === undefined ? {} : { fetch }),
  })

  client.use({
    onRequest({ request }) {
      const token = csrfToken()
      if (changesState(request.method) && token !== undefined) request.headers.set(csrfHeaderName, token)
    },
    // A success must be what its operation answers with. A gateway's page, or the `index.html` a static host serves with
    // 200 to a wrong `VITE_API_URL`, is an answer that arrived and is not the contract's: it keeps its status, which is
    // what tells it from a lost connection. Without a body (`204`, empty) there is no type to check.
    onResponse({ response, schemaPath }) {
      const hasBody = response.status !== 204 && response.headers.get('Content-Length') !== '0'
      const expected = schemaPath === download ? 'application/octet-stream' : 'application/json'
      if (response.ok && hasBody && response.headers.get('Content-Type')?.includes(expected) !== true) {
        throw new TransportError(response.status)
      }
    },
    // A failed `fetch` has no contract code to carry: it is its own error, so no screen mistakes it for a refusal.
    onError({ error }) {
      return new TransportError(null, { cause: error })
    },
  })

  return {
    getMe: () => data(client.GET('/api/me')),
    signUp: (request) => data(client.POST('/api/auth/sign-up', request)),
    signIn: (request) => data(client.POST('/api/auth/sign-in', request)),
    signOut: () => empty(client.POST('/api/auth/sign-out')),
    listWorkspaces: () => data(client.GET('/api/workspaces')),
    getWorkspace: (request) => data(client.GET('/api/workspaces/{workspaceId}', request)),
    updateWorkspace: (request) => data(client.PATCH('/api/workspaces/{workspaceId}', request)),
    listMembers: (request) => data(client.GET('/api/workspaces/{workspaceId}/members', request)),
    addMember: (request) => data(client.POST('/api/workspaces/{workspaceId}/members', request)),
    updateMember: (request) => data(client.PATCH('/api/workspaces/{workspaceId}/members/{userId}', request)),
    removeMember: (request) => empty(client.DELETE('/api/workspaces/{workspaceId}/members/{userId}', request)),
    listFolders: (request) => data(client.GET('/api/workspaces/{workspaceId}/folders', request)),
    createFolder: (request) => data(client.POST('/api/workspaces/{workspaceId}/folders', request)),
    updateFolder: (request) => data(client.PATCH('/api/folders/{folderId}', request)),
    deleteFolder: (request) => empty(client.DELETE('/api/folders/{folderId}', request)),
    listDocuments: (request) => data(client.GET('/api/workspaces/{workspaceId}/documents', request)),
    createDocument: (request) => data(client.POST('/api/workspaces/{workspaceId}/documents', request)),
    getDocument: (request) => data(client.GET('/api/documents/{documentId}', request)),
    updateDocument: (request) => data(client.PATCH('/api/documents/{documentId}', request)),
    deleteDocument: (request) => empty(client.DELETE('/api/documents/{documentId}', request)),
    archiveDocument: (request) => data(client.POST('/api/documents/{documentId}/archive', request)),
    restoreDocument: (request) => data(client.POST('/api/documents/{documentId}/restore', request)),
    pinDocument: (request) => empty(client.PUT('/api/documents/{documentId}/pin', request)),
    unpinDocument: (request) => empty(client.DELETE('/api/documents/{documentId}/pin', request)),
    listPinnedDocuments: (request) => data(client.GET('/api/workspaces/{workspaceId}/pinned', request)),
    listSharedDocuments: (request) => data(client.GET('/api/workspaces/{workspaceId}/shared', request)),
    listAccess: (request) => data(client.GET('/api/documents/{documentId}/access', request)),
    setAccess: (request) => data(client.PUT('/api/documents/{documentId}/access/{userId}', request)),
    removeAccess: (request) => empty(client.DELETE('/api/documents/{documentId}/access/{userId}', request)),
    setGeneralAccess: (request) => data(client.PUT('/api/documents/{documentId}/general-access', request)),
    listThreads: (request) => data(client.GET('/api/documents/{documentId}/threads', request)),
    createThread: (request) => data(client.POST('/api/documents/{documentId}/threads', request)),
    replyToThread: (request) => data(client.POST('/api/threads/{threadId}/replies', request)),
    resolveThread: (request) => data(client.POST('/api/threads/{threadId}/resolve', request)),
    reopenThread: (request) => data(client.POST('/api/threads/{threadId}/reopen', request)),
    updateComment: (request) => data(client.PATCH('/api/comments/{commentId}', request)),
    deleteComment: (request) => empty(client.DELETE('/api/comments/{commentId}', request)),
    listVersions: (request) => data(client.GET('/api/documents/{documentId}/versions', request)),
    createVersion: (request) => data(client.POST('/api/documents/{documentId}/versions', request)),
    getVersionContent: (request) =>
      bytes(client.GET('/api/versions/{versionId}/content', { ...request, parseAs: 'arrayBuffer' })),
    restoreVersion: (request) => data(client.POST('/api/versions/{versionId}/restore', request)),
    listWorkspaceActivity: (request) => data(client.GET('/api/workspaces/{workspaceId}/activity', request)),
    listDocumentActivity: (request) => data(client.GET('/api/documents/{documentId}/activity', request)),
    listTemplates: (request) => data(client.GET('/api/templates', request)),
  }
}
