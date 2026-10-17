import type { DataSource } from '../../DataSource.ts'
import { addPendingPerson, checkEmailFormat, findPerson } from '../directory.ts'
import { caller, type Context } from '../guards.ts'
import { textLimits } from '../limits.ts'
import { conflict, invalid, unauthenticated } from '../problems.ts'
import { checkTexts } from '../text.ts'
import { meView } from '../views.ts'

/** The password as the server keeps it: normalised to NFKC, so the same letters written two ways are one password. */
const normalised = (password: string): string => password.normalize('NFKC')

type SessionOperations = Pick<DataSource, 'getMe' | 'updateMe' | 'signUp' | 'signIn' | 'signOut'>

/**
 * Who is signed in. There is no cookie here: a connection to the mock keeps its own session, which is what `dr_session`
 * stands for, and the CSRF token has nothing to protect because no request crosses a network.
 */
export function sessionOperations(ctx: Context): SessionOperations {
  const { world, session } = ctx

  return {
    getMe: async () => meView(caller(ctx)),

    updateMe: async ({ body }) => {
      const person = caller(ctx)
      const { name, locale, editorTextSize } = body
      if (name === undefined && locale === undefined && editorTextSize === undefined) {
        throw invalid({ pointer: '/', code: 'required' })
      }
      if (name !== undefined) checkTexts(['/name', name, textLimits.personName])
      if (name !== undefined) person.name = name
      if (locale !== undefined) person.locale = locale
      if (editorTextSize !== undefined) person.editorTextSize = editorTextSize
      return meView(person)
    },

    signUp: async ({ body }) => {
      checkTexts(
        ['/email', body.email, textLimits.email],
        ['/password', body.password, textLimits.password],
        ['/name', body.name, textLimits.personName],
      )
      checkEmailFormat(body.email)

      const existing = findPerson(world, body.email)
      if (existing !== undefined && existing.password !== null) throw conflict()

      // Someone invited by email has a row and a `userId` already: signing up claims it, with its memberships and grants.
      const account = existing ?? addPendingPerson(world, body.email)
      account.name = body.name
      account.password = normalised(body.password)
      // Somebody nobody invited starts in a workspace of their own, named as they are; claiming an invitation gives a seat already.
      if (!world.memberships.some((membership) => membership.userId === account.id)) {
        const workspace = { id: world.newId(), name: body.name, createdAt: world.now() }
        world.workspaces.push(workspace)
        world.memberships.push({
          workspaceId: workspace.id,
          userId: account.id,
          role: 'owner',
          createdAt: workspace.createdAt,
        })
      }
      session.userId = account.id
      return { id: account.id, email: account.email, name: body.name }
    },

    signIn: async ({ body }) => {
      // The same answer for an unknown email and a wrong password, so it never says which accounts exist.
      const account = findPerson(world, body.email)
      if (account === undefined || account.password !== normalised(body.password) || account.name === null)
        throw unauthenticated()
      session.userId = account.id
      return { id: account.id, email: account.email, name: account.name }
    },

    signOut: async () => {
      caller(ctx)
      session.userId = null
    },
  }
}
