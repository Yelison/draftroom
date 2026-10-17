import { describe } from 'vitest'
import { describeDataSourceContract, type Scenario } from '../contract.suite.ts'
import { checkedAgainstContract, loadContract } from '../testing/contract.ts'
import { createMockServer } from './createMockDataSource.ts'
import { daniel, harborPine, marta, wei } from './fixtures/index.ts'

const contract = loadContract()

describe('MockDataSource', () => {
  // Every answer the suite gets is checked against openapi.yaml on its way back, so a response that drifts from the
  // contract fails the test that caused it, not just a test of the mock about its own shape.
  describeDataSourceContract('the mock, answers checked against openapi.yaml', {
    async scenario(): Promise<Scenario> {
      const server = createMockServer()
      const connect = (email?: string) =>
        checkedAgainstContract(server.connect(email === undefined ? {} : { signedInAs: email }), contract)
      return {
        workspaceId: harborPine.id,
        owner: connect(marta.email),
        ownerId: marta.id,
        member: connect(daniel.email),
        memberId: daniel.id,
        outsider: connect(wei.email),
        anonymous: connect(),
        connectAs: connect,
      }
    },
  })
})
