import type { DataSource, OperationId } from '../DataSource.ts'
import { threads as threadFixtures, versions as versionFixtures } from '../mock/fixtures/collaboration.ts'
import { budget, designReview, launchPlan, oldPricing } from '../mock/fixtures/documents.ts'
import { daniel, demoPassword, harborPine, sofia } from '../mock/fixtures/index.ts'
import { folders as folderFixtures, ideasFolder } from '../mock/fixtures/workspaces.ts'
import type { excludedOperations } from '../mock/unhandled.ts'

/** The operations of the data source the mock implements: every one of the contract but the ones it leaves out. */
export type Implemented = Exclude<OperationId, keyof typeof excludedOperations>

const documentPath = (documentId: string) => ({ params: { path: { documentId } } })
const workspacePath = { params: { path: { workspaceId: harborPine.id } } }
const threadId = threadFixtures[0]?.id ?? ''
// Marta's own reply: only an author edits a comment.
const commentId = threadFixtures[0]?.comments[1]?.id ?? ''

// One call per operation of the data source, with arguments the mock accepts and a different person where the
// operation is meant for one. The type makes a new operation of the contract a compile error here until it has a call:
// the mock's walk runs each one through the contract check and the HTTP bindings' test runs each one through a recording
// `fetch`, so both are held to the same list.
export const calls: Record<Implemented, (api: DataSource) => Promise<unknown>> = {
  getMe: (api) => api.getMe(),
  signUp: (api) =>
    api.signUp({ body: { email: 'nuria@harborpine.example', password: demoPassword, name: 'Nuria Vega' } }),
  signIn: (api) => api.signIn({ body: { email: daniel.email, password: demoPassword } }),
  signOut: (api) => api.signOut(),
  listWorkspaces: (api) => api.listWorkspaces(),
  getWorkspace: (api) => api.getWorkspace(workspacePath),
  updateWorkspace: (api) => api.updateWorkspace({ ...workspacePath, body: { name: 'Harbor Pine Studio' } }),
  listMembers: (api) => api.listMembers(workspacePath),
  addMember: (api) => api.addMember({ ...workspacePath, body: { email: 'idris@harborpine.example', role: 'member' } }),
  updateMember: (api) =>
    api.updateMember({ params: { path: { workspaceId: harborPine.id, userId: daniel.id } }, body: { role: 'owner' } }),
  removeMember: (api) => api.removeMember({ params: { path: { workspaceId: harborPine.id, userId: sofia.id } } }),
  listFolders: (api) => api.listFolders(workspacePath),
  createFolder: (api) => api.createFolder({ ...workspacePath, body: { name: 'Archivo' } }),
  updateFolder: (api) =>
    api.updateFolder({
      params: { path: { folderId: folderFixtures[0]?.id ?? '' } },
      body: { name: 'Roadmap', revision: 1 },
    }),
  deleteFolder: (api) => api.deleteFolder({ params: { path: { folderId: ideasFolder.id } } }),
  listDocuments: (api) => api.listDocuments({ params: { path: { workspaceId: harborPine.id }, query: { limit: 5 } } }),
  createDocument: (api) =>
    api.createDocument({
      ...workspacePath,
      body: { title: 'Notas del lunes', templateId: 'meeting-notes', locale: 'es' },
    }),
  getDocument: (api) => api.getDocument(documentPath(launchPlan.id)),
  updateDocument: (api) =>
    api.updateDocument({
      ...documentPath(launchPlan.id),
      body: { title: 'Autumn launch plan v2', revision: launchPlan.revision },
    }),
  deleteDocument: (api) => api.deleteDocument(documentPath(oldPricing.id)),
  archiveDocument: (api) => api.archiveDocument(documentPath(budget.id)),
  restoreDocument: (api) => api.restoreDocument(documentPath(oldPricing.id)),
  pinDocument: (api) => api.pinDocument(documentPath(designReview.id)),
  unpinDocument: (api) => api.unpinDocument(documentPath(launchPlan.id)),
  listPinnedDocuments: (api) => api.listPinnedDocuments(workspacePath),
  listSharedDocuments: (api) =>
    api.listSharedDocuments({ params: { path: { workspaceId: harborPine.id }, query: { access: 'view' } } }),
  listAccess: (api) => api.listAccess(documentPath(launchPlan.id)),
  setAccess: (api) =>
    api.setAccess({ params: { path: { documentId: launchPlan.id, userId: sofia.id } }, body: { role: 'editor' } }),
  removeAccess: (api) => api.removeAccess({ params: { path: { documentId: launchPlan.id, userId: daniel.id } } }),
  setGeneralAccess: (api) =>
    api.setGeneralAccess({ ...documentPath(launchPlan.id), body: { generalAccess: 'viewer' } }),
  listThreads: (api) => api.listThreads(documentPath(launchPlan.id)),
  createThread: (api) =>
    api.createThread({
      ...documentPath(launchPlan.id),
      body: { anchor: { start: 'AQ==', end: 'Ag==' }, quote: 'Q4', body: 'Revisamos esto?' },
    }),
  replyToThread: (api) => api.replyToThread({ params: { path: { threadId } }, body: { body: 'Hecho.' } }),
  resolveThread: (api) => api.resolveThread({ params: { path: { threadId } } }),
  reopenThread: (api) => api.reopenThread({ params: { path: { threadId } } }),
  updateComment: (api) => api.updateComment({ params: { path: { commentId } }, body: { body: 'Who signs it off?' } }),
  deleteComment: (api) => api.deleteComment({ params: { path: { commentId } } }),
  listVersions: (api) => api.listVersions({ params: { path: { documentId: launchPlan.id }, query: { limit: 2 } } }),
  createVersion: (api) => api.createVersion({ ...documentPath(launchPlan.id), body: { label: 'Before the review' } }),
  getVersionContent: (api) => api.getVersionContent({ params: { path: { versionId: versionFixtures[0]?.id ?? '' } } }),
  restoreVersion: (api) => api.restoreVersion({ params: { path: { versionId: versionFixtures[0]?.id ?? '' } } }),
  listWorkspaceActivity: (api) =>
    api.listWorkspaceActivity({ params: { path: { workspaceId: harborPine.id }, query: { limit: 4 } } }),
  listDocumentActivity: (api) => api.listDocumentActivity(documentPath(launchPlan.id)),
  listTemplates: (api) => api.listTemplates({ params: { query: { locale: 'es' } } }),
}
