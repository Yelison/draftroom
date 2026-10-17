import type { DocumentBroadcaster } from '../../src/http/document-broadcaster.ts'
import type { LiveAccess } from '../../src/http/live-access.ts'
import type { LiveDocuments } from '../../src/http/live-documents.ts'

/** For an app under test that has no collaboration server beside it: nobody is told, and nobody is missing. */
export const silentBroadcaster: DocumentBroadcaster = { broadcast: () => undefined }

/** The same for access: no connections are held to anything, because there is no collaboration server to hold them. */
export const silentLiveAccess: LiveAccess = {
  documentChanged: async () => undefined,
  memberChanged: async () => undefined,
  sessionEnded: async () => undefined,
}

/** For an app that is only built or asked about its routes: it has no documents to work on, so any work on one is a mistake of the test. */
export const noLiveDocuments: LiveDocuments = {
  withState: () => Promise.reject(new Error('This app has no documents to work on')),
  restore: () => Promise.reject(new Error('This app has no documents to work on')),
}
