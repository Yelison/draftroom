import { documentName } from '@draftroom/contract/collab'
import * as Y from 'yjs'
import { isRecord } from '../../../collab/awareness.ts'
import { presenceLookOf } from '../../../collab/presenceColor.ts'
import type { CollabSession } from '../../../collab/session.ts'
import type { Locale } from '../../../i18n/locale.ts'
import type { CollaboratorScript } from '../fixtures/collaboratorScripts.ts'
import type { PageEnvironment } from './browserPage.ts'
import { startCollaborator } from './scriptedCollaborator.ts'
import type { SimulatedCollabServer } from './SimulatedCollabServer.ts'

/**
 * Brings the people of the scripts into their documents: she is there while somebody else has the document open and the
 * tab can be seen, and gone when nobody has or the tab is hidden. She is a person with a connection of her own, so the
 * editor shows her, and who is in the document is what the server says.
 */
export function seatCollaborators(
  server: SimulatedCollabServer,
  scripts: readonly CollaboratorScript[],
  locale: Locale,
  page: PageEnvironment,
): () => void {
  const seats = scripts.map((script) => seatOf(server, script, locale, page))
  return () => seats.forEach((stop) => stop())
}

function seatOf(
  server: SimulatedCollabServer,
  { documentId, person, lines }: CollaboratorScript,
  locale: Locale,
  page: PageEnvironment,
): () => void {
  const name = documentName(documentId)
  let visitors = 0
  /** Whether she is in the document or on her way in. */
  let present = false
  /** What takes her out of the document, once she is in it. */
  let leave: (() => void) | undefined
  /** Changes whenever she is sent in or out, so that a turn that was waited for after that is not taken. */
  let request = 0

  async function enter(): Promise<void> {
    const mine = (request += 1)
    const giveUpTurn = await page.takeTurn(name)
    if (giveUpTurn === null) {
      // Another tab has her: this one tries again the next time something changes.
      if (mine === request) present = false
      return
    }
    // Loaded now and not before: the demo's first screen has no use for the collaboration session.
    const { createCollabSession } = await import('../../../collab/session.ts')
    if (mine !== request) return giveUpTurn()
    const session = createCollabSession({
      documentId,
      url: 'ws://simulated.invalid',
      webSocket: server.socketFor({ userId: person.id, displayName: person.name ?? person.email }),
    })
    const { provider } = session.getSnapshot()
    provider.setAwarenessField('user', {
      id: person.id,
      name: person.name ?? person.email,
      color: presenceLookOf(person.id).color,
    })
    const stop = startCollaborator(
      {
        ydoc: session.getSnapshot().ydoc,
        otherCursors: () => cursorsOfOthers(session),
        showCursor: (position) => {
          const cursor = Y.relativePositionToJSON(position)
          provider.setAwarenessField('cursor', { anchor: cursor, head: cursor })
        },
      },
      lines[locale],
      page,
    )
    leave = () => {
      stop()
      session.destroy()
      giveUpTurn()
    }
  }

  function reconcile(): void {
    const wanted = visitors > 0 && !page.hidden()
    if (wanted && !present) {
      present = true
      void enter()
    }
    if (!wanted) {
      request += 1
      present = false
      leave?.()
      leave = undefined
    }
  }

  const stopObserving = server.observe({
    joined(joinedName, userId) {
      if (joinedName !== name || userId === person.id) return
      visitors += 1
      reconcile()
    },
    left(leftName, userId) {
      if (leftName !== name || userId === person.id) return
      visitors -= 1
      reconcile()
    },
  })
  const stopWatching = page.onVisibilityChange(reconcile)
  return () => {
    stopObserving()
    stopWatching()
    visitors = 0
    reconcile()
  }
}

/** The cursors the people of the document publish, as the relative positions the editor writes into the awareness. */
function cursorsOfOthers(session: CollabSession): unknown[] {
  const { awareness } = session.getSnapshot().provider
  if (awareness === null) return []
  return [...awareness.getStates()]
    .filter(([clientId]) => clientId !== awareness.clientID)
    .flatMap(([, state]) => {
      const cursor = isRecord(state) ? state['cursor'] : undefined
      return isRecord(cursor) ? [cursor['anchor'], cursor['head']] : []
    })
}
