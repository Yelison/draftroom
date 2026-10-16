import { documentName } from '@draftroom/contract/collab'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCollabSession } from '../../../collab/session.ts'
import { advance } from '../../../collab/testing/sessionWorld.ts'
import { describeSessionContract } from '../../../collab/testing/sessionContract.ts'
import { createMockServer } from '../createMockDataSource.ts'
import { daniel, marta, wei } from '../fixtures/index.ts'
import { budget as budgetDocument } from '../fixtures/documents.ts'

// The budget is Marta's, and Daniel may only read it; Wei belongs to another workspace and cannot see it.
const people = { editor: marta.email, reader: daniel.email, stranger: wei.email }

describeSessionContract('the collaboration of the mock data source', () => {
  const server = createMockServer()
  const sessions: { destroy(): void }[] = []
  return {
    server: server.collaboration,
    wireName: documentName(budgetDocument.id),
    open(who) {
      const session = createCollabSession({
        documentId: budgetDocument.id,
        ...server.connect({ signedInAs: people[who] }).collaboration,
      })
      sessions.push(session)
      return session
    },
    dispose: () => sessions.splice(0).forEach((session) => session.destroy()),
  }
})

describe('the collaboration of the mock for a document that is archived', () => {
  afterEach(() => vi.useRealTimers())

  it('opens it read-only even for its owner, who may otherwise edit it', async () => {
    vi.useFakeTimers()
    const server = createMockServer()
    const owner = server.connect({ signedInAs: marta.email })
    await owner.archiveDocument({ params: { path: { documentId: budgetDocument.id } } })

    const session = createCollabSession({ documentId: budgetDocument.id, ...owner.collaboration })
    await advance(50)

    expect(session.getSnapshot()).toMatchObject({ state: 'read-only', editable: false })
    session.destroy()
  })
})
