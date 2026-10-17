import type { DataSource } from '../../DataSource.ts'
import type { MembershipRecord } from '../fixtures/workspaces.ts'
import { addPendingPerson, checkEmailFormat, findPerson } from '../directory.ts'
import { record } from '../events.ts'
import { caller, requireWorkspaceOwner, workspaceOf, type Context } from '../guards.ts'
import { textLimits } from '../limits.ts'
import { sortRows } from '../pagination.ts'
import { conflict, lastOwner, notFound } from '../problems.ts'
import { checkTexts } from '../text.ts'
import { memberView } from '../views.ts'

type MemberOperations = Pick<DataSource, 'listMembers' | 'addMember' | 'updateMember' | 'removeMember'>

export function memberOperations(ctx: Context): MemberOperations {
  const { world } = ctx

  const ownersOf = (workspaceId: string) =>
    world.memberships.filter((row) => row.workspaceId === workspaceId && row.role === 'owner')

  /** Only an owner who has signed up can act as one: a pending owner does not keep the workspace from losing its last. */
  const isActive = (userId: string) => world.people.find((person) => person.id === userId)?.password != null
  const activeOwnersExcept = (workspaceId: string, userId: string) =>
    ownersOf(workspaceId).filter((row) => row.userId !== userId && isActive(row.userId))

  function membershipOf(workspaceId: string, userId: string): MembershipRecord {
    const membership = world.memberships.find((row) => row.workspaceId === workspaceId && row.userId === userId)
    if (membership === undefined) throw notFound()
    return membership
  }

  /** Who inherits the documents of someone who leaves: the owner who removed them or, when an owner leaves, the owner who has been there longest. */
  function successorOf(workspaceId: string, leaving: string, actorId: string): string | undefined {
    if (leaving !== actorId) return actorId
    const others = activeOwnersExcept(workspaceId, leaving)
    return sortRows(others, { key: (row) => row.createdAt, id: (row) => row.userId, direction: 'asc' })[0]?.userId
  }

  /**
   * A document always keeps an explicit owner. When the person leaving holds the only such grant of a document, it goes
   * to their successor, and one `access.granted` event says so: the removal is not blocked.
   */
  function handOverDocuments(workspaceId: string, leaving: string, successor: string, actorId: string) {
    for (const document of world.documents.filter((row) => row.workspaceId === workspaceId)) {
      const owners = world.grants.filter((row) => row.documentId === document.id && row.role === 'owner')
      if (owners.length !== 1 || owners[0]?.userId !== leaving) continue
      const inherited = world.grants.find((row) => row.documentId === document.id && row.userId === successor)
      if (inherited === undefined) {
        world.grants.push({ documentId: document.id, userId: successor, role: 'owner', createdAt: world.now() })
      } else {
        inherited.role = 'owner'
      }
      record(world, 'access.granted', actorId, document.id, successor)
    }
  }

  return {
    listMembers: async ({ params: { path } }) => {
      workspaceOf(ctx, path.workspaceId)
      const rows = world.memberships.filter((row) => row.workspaceId === path.workspaceId)
      return {
        items: sortRows(rows, { key: (row) => row.createdAt, id: (row) => row.userId, direction: 'asc' }).map((row) =>
          memberView(world, row),
        ),
      }
    },

    addMember: async ({ params: { path }, body }) => {
      caller(ctx)
      checkTexts(['/email', body.email, textLimits.email])
      checkEmailFormat(body.email)
      const { workspace, role } = workspaceOf(ctx, path.workspaceId)
      requireWorkspaceOwner(role)

      const known = findPerson(world, body.email)
      if (
        known !== undefined &&
        world.memberships.some((row) => row.workspaceId === workspace.id && row.userId === known.id)
      ) {
        throw conflict()
      }
      // Without an account the person is pending, with the `userId` the account will keep when they sign up.
      const person = known ?? addPendingPerson(world, body.email)
      const membership: MembershipRecord = {
        workspaceId: workspace.id,
        userId: person.id,
        role: body.role,
        createdAt: world.now(),
      }
      world.memberships.push(membership)
      return memberView(world, membership)
    },

    updateMember: async ({ params: { path }, body }) => {
      const { workspace, role } = workspaceOf(ctx, path.workspaceId)
      requireWorkspaceOwner(role)
      const membership = membershipOf(workspace.id, path.userId)
      const leavesNoOwner =
        isActive(membership.userId) && activeOwnersExcept(workspace.id, membership.userId).length === 0
      if (membership.role === 'owner' && body.role !== 'owner' && leavesNoOwner) throw lastOwner()
      membership.role = body.role
      return memberView(world, membership)
    },

    removeMember: async ({ params: { path } }) => {
      const user = caller(ctx)
      const { workspace, role } = workspaceOf(ctx, path.workspaceId)
      requireWorkspaceOwner(role)
      const membership = membershipOf(workspace.id, path.userId)
      // Only an owner removing themselves can leave the workspace without one who can act: anyone else is removed by an owner.
      const successor = successorOf(workspace.id, membership.userId, user.id)
      if (successor === undefined) throw lastOwner()

      handOverDocuments(workspace.id, membership.userId, successor, user.id)
      const documentIds = new Set(
        world.documents.filter((row) => row.workspaceId === workspace.id).map((row) => row.id),
      )
      world.grants = world.grants.filter(
        (row) => !(row.userId === membership.userId && documentIds.has(row.documentId)),
      )
      world.pins = world.pins.filter((row) => !(row.userId === membership.userId && documentIds.has(row.documentId)))
      world.memberships.splice(world.memberships.indexOf(membership), 1)
    },
  }
}
