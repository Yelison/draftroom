import { presenceLookOf } from '../../../collab/presenceColor.ts'
import { createCollabSession } from '../../../collab/session.ts'
import { seedId } from '../ids.ts'
import type { World } from '../world.ts'
import type { SimulatedCollabServer } from './SimulatedCollabServer.ts'

/**
 * Puts people in a document, each with a connection of their own: the way an end-to-end test, which has one browser,
 * sees what the editor shows when others are there. They are made members of the document's workspace (so the
 * collaboration server lets them in) and say who they are as a browser does. Returns what ends their connections.
 */
export function joinDocument(
  world: World,
  collaboration: SimulatedCollabServer,
  documentId: string,
  names: readonly string[],
): () => void {
  const document = world.documents.find((row) => row.id === documentId)
  if (document === undefined) throw new Error(`The mock has no document ${documentId}`)
  const sessions = names.map((name, index) => {
    const id = seedId(9, world.people.length + index + 1)
    world.people.push({
      id,
      email: `${id}@harborpine.example`,
      name,
      password: null,
      locale: null,
      editorTextSize: 'medium',
    })
    world.memberships.push({ workspaceId: document.workspaceId, userId: id, role: 'member', createdAt: world.now() })
    const session = createCollabSession({
      documentId,
      url: 'ws://simulated.invalid',
      webSocket: collaboration.socketFor({ userId: id, displayName: name }),
    })
    session.getSnapshot().provider.setAwarenessField('user', { id, name, color: presenceLookOf(id).color })
    return session
  })
  return () => sessions.forEach((session) => session.destroy())
}
