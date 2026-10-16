import type { DocumentBroadcaster } from '../../src/http/document-broadcaster.ts'
import type { LiveAccess } from '../../src/http/live-access.ts'

/** For an app under test that has no collaboration server beside it: nobody is told, and nobody is missing. */
export const silentBroadcaster: DocumentBroadcaster = { broadcast: () => undefined }

/** The same for access: no connections are held to anything, because there is no collaboration server to hold them. */
export const silentLiveAccess: LiveAccess = {
  documentChanged: async () => undefined,
  memberChanged: async () => undefined,
}
