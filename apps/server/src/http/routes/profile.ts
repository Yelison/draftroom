import type { Schema } from '@draftroom/contract'
import type { FastifyPluginCallback } from 'fastify'
import { findProfile, updateProfile, type ProfileRow } from '../../db/profile.ts'
import { principalOf } from '../auth/authenticate.ts'
import { operationRoute } from '../operation-route.ts'
import { ProblemError } from '../problem.ts'
import { presentMe } from '../presenters.ts'
import type { RouteDependencies } from './dependencies.ts'

// A person's own account: the only person these routes name is the one of the session, so nobody can reach another's.

/** The session belongs to a person who signed up, and signing up gives a name: anything else is a broken session. */
function requireSignedUp(person: ProfileRow | undefined): ProfileRow & { readonly name: string } {
  if (person?.name == null) throw new ProblemError('unauthenticated')
  return { ...person, name: person.name }
}

export const profileRoutes: FastifyPluginCallback<RouteDependencies> = (app, { contract, database }, done) => {
  app.route(
    operationRoute(contract, 'getMe', async (request): Promise<Schema<'Me'>> => {
      return presentMe(requireSignedUp(await findProfile(database, principalOf(request).userId)))
    }),
  )

  app.route(
    operationRoute(contract, 'updateMe', async (request): Promise<Schema<'Me'>> => {
      return presentMe(requireSignedUp(await updateProfile(database, principalOf(request).userId, request.body)))
    }),
  )

  done()
}
