import type { DocumentBroadcaster } from '../../src/http/document-broadcaster.ts'

/** For an app under test that has no collaboration server beside it: nobody is told, and nobody is missing. */
export const silentBroadcaster: DocumentBroadcaster = { broadcast: () => undefined }
