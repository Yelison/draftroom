import { documentName } from '@draftroom/contract/collab'
import { describeSessionContract } from '../../../collab/testing/sessionContract.ts'
import { createMockServer } from '../createMockDataSource.ts'
import { daniel, marta, wei } from '../fixtures/index.ts'
import { budget as budgetDocument } from '../fixtures/documents.ts'

// The budget is Marta's, and Daniel may only read it; Wei belongs to another workspace and cannot see it.
const people = { editor: marta.email, reader: daniel.email, stranger: wei.email }

describeSessionContract('openDocument of the mock data source', () => {
  const server = createMockServer()
  const sessions: { destroy(): void }[] = []
  return {
    server: server.collaboration,
    wireName: documentName(budgetDocument.id),
    open(who) {
      const session = server.connect({ signedInAs: people[who] }).openDocument(budgetDocument.id)
      sessions.push(session)
      return session
    },
    dispose: () => sessions.splice(0).forEach((session) => session.destroy()),
  }
})
