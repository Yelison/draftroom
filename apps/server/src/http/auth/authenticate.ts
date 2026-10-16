import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Contract } from '../contract.ts'
import { sendProblem } from '../problem.ts'
import type { AuthProvider, Principal } from './auth-provider.ts'

declare module 'fastify' {
  interface FastifyRequest {
    /** Who is calling, set before any handler of an operation that needs a session; `null` on the public ones. */
    principal: Principal | null
  }
}

/** The caller of a handler of an operation that needs a session: the hook has already refused anyone else. */
export function principalOf(request: FastifyRequest): Principal {
  if (request.principal === null) throw new Error('The operation has no caller: it is declared without a session')
  return request.principal
}

/**
 * The first two checks of the order, ahead of the body being read: a request without a session is a 401 whatever it
 * sends, so nothing about the shape or the existence of a resource is told to someone who is not signed in. A hook of
 * the app, on `onRequest`, because the body is parsed (and can fail) after it and before `preHandler`.
 */
export function requireAuthentication(app: FastifyInstance, contract: Contract, provider: AuthProvider): void {
  app.decorateRequest('principal', null)
  app.addHook('onRequest', async (request, reply) => {
    const operationId = request.routeOptions.config.operationId
    if (operationId === undefined) return
    const { security } = contract.operation(operationId)
    if (!security.session) return

    const authentication = await provider.authenticate(request, { csrf: security.csrf })
    if (authentication.status === 'authenticated') {
      request.principal = authentication.principal
      return
    }
    return sendProblem(reply, authentication.status === 'csrf-rejected' ? 'csrf' : 'unauthenticated')
  })
}
