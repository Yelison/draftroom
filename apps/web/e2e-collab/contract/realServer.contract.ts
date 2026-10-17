import { describe } from 'vitest'
import { describeDataSourceContract, type Scenario } from '../../src/data/contract.suite.ts'
import { checkedAgainstContract, loadContract } from '../../src/data/testing/contract.ts'
import { query } from '../database.ts'
import { restWithIdentity } from '../people.ts'

const contract = loadContract()

interface Account {
  id: string
  email: string
  name: string
}

const account = (role: string): Account => {
  const id = crypto.randomUUID()
  return { id, email: `${role}-${id}@contract.example`, name: `Contract ${role}` }
}

/**
 * The people and the workspaces of one test, written straight into the database: the server has no sign-up before T7.1, and
 * the suite asks for a workspace nobody has used. The owner and a member share one workspace; the outsider has another.
 */
function createWorkspaces(owner: Account, member: Account, outsider: Account): { workspaceId: string } {
  const workspaceId = crypto.randomUUID()
  const otherWorkspaceId = crypto.randomUUID()
  const people = [owner, member, outsider]
    .map(({ id, email, name }) => `('${id}', '${email}', '${name}', now())`)
    .join(', ')
  query(`
    insert into users (id, email, name, signed_up_at) values ${people};
    insert into workspaces (id, name) values ('${workspaceId}', 'Contract workspace'), ('${otherWorkspaceId}', 'Other workspace');
    insert into memberships (workspace_id, user_id, role) values
      ('${workspaceId}', '${owner.id}', 'owner'),
      ('${workspaceId}', '${member.id}', 'member'),
      ('${otherWorkspaceId}', '${outsider.id}', 'owner');
  `)
  return { workspaceId }
}

describe('the real server', () => {
  // The same battery as the mock's, over HTTP to the real server and the real database. Every answer is checked against
  // openapi.yaml on its way back, as the mock's are, so the two are held to the same document and to the same assertions.
  describeDataSourceContract('the real server, answers checked against openapi.yaml', {
    async scenario(): Promise<Scenario> {
      const [owner, member, outsider] = [account('owner'), account('member'), account('outsider')] as const
      const { workspaceId } = createWorkspaces(owner, member, outsider)
      const connect = (email?: string) => checkedAgainstContract(restWithIdentity(email), contract)
      return {
        workspaceId,
        owner: connect(owner.email),
        ownerId: owner.id,
        member: connect(member.email),
        memberId: member.id,
        outsider: connect(outsider.email),
        anonymous: connect(),
        connectAs: connect,
      }
    },
  })
})
