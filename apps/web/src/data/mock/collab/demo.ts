import { parseDocumentName } from '@draftroom/contract/collab'
import type { Locale } from '../../../i18n/locale.ts'
import { collaboratorScripts, type CollaboratorScript } from '../fixtures/collaboratorScripts.ts'
import { demoDocument } from './demoDocuments.ts'
import { browserPage, type PageEnvironment } from './browserPage.ts'
import { seatCollaborators } from './collaborators.ts'
import type { SimulatedCollabServer } from './SimulatedCollabServer.ts'
import { browserTransport, joinTabs, type TabLink, type TabTransport } from './tabLink.ts'

export interface DemoOptions {
  /** The language the demo started in: the documents and what the collaborators write are in it. */
  locale: Locale
  /** Where the tabs of the browser meet; `null` means the demo is one tab. */
  transport?: TabTransport | null
  page?: PageEnvironment
  /** The people who write in the documents; none turns the collaborators off. */
  scripts?: readonly CollaboratorScript[]
  /** How long a tab that opens waits to hear which world the open tabs are in. */
  discoveryMs?: number
}

/**
 * What makes the mock a demo: documents that open with their text, the tabs of a browser on the same documents, and the
 * people who write in some of them. It exists only in the mock, and only a build for the static demo asks for it (the
 * suites of the mock and the mocked end-to-end tests do not, so their documents start empty and nobody else is there).
 */
export interface Demo {
  /** The Yjs update a document starts with, when this tab is the one to write it. */
  initialContent(documentName: string): Uint8Array | undefined
  /** Puts the demo on `server`; returns what ends it. */
  start(server: SimulatedCollabServer): () => void
}

export function createDemo({
  locale,
  transport = browserTransport() ?? null,
  page = browserPage(),
  scripts = collaboratorScripts,
  discoveryMs = 150,
}: DemoOptions): Demo {
  let link: TabLink | undefined
  const startingContent = (documentName: string) => {
    const documentId = parseDocumentName(documentName)
    // The same bytes in every tab: the comments of the demo are anchored in this text (`seededContent.ts`).
    return documentId === null ? undefined : demoDocument(locale, documentId)?.update
  }
  return {
    initialContent(documentName) {
      // Written once, by one tab, when the document is opened: two tabs that each wrote it would leave it twice.
      const mayStart = link === undefined ? transport === null : link.mayStartContent(documentName)
      return mayStart ? startingContent(documentName) : undefined
    },
    start(server) {
      const stopCollaborators = seatCollaborators(server, scripts, locale, page)
      if (transport !== null) {
        // Nothing is opened until this tab knows which world it is in, so no document starts before its content is known.
        server.holdAuthentication()
        void joinTabs(server, transport, {
          peer: crypto.randomUUID(),
          now: () => Date.now(),
          discoveryMs,
          fresh: page.isReload(),
          startingContent,
        }).then((joined) => {
          link = joined
          server.releaseAuthentication()
        })
      }
      const end = () => {
        stopCollaborators()
        link?.close()
      }
      page.onPageHide(end)
      return end
    },
  }
}
