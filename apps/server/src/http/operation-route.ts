import type { RouteHandlerMethod, RouteOptions } from 'fastify'
import type { Contract } from './contract.ts'

declare module 'fastify' {
  interface FastifyContextConfig {
    /** The `operationId` of the contract this route implements: what the request and response checks look up. */
    operationId?: string
  }
}

/**
 * A route whose method, path and checks all come from one operation of the contract, so a route cannot drift from the
 * file that documents it, and `GET /api/health/live` is written once.
 */
export function operationRoute(contract: Contract, operationId: string, handler: RouteHandlerMethod): RouteOptions {
  const { method, routePath } = contract.operation(operationId)
  return { method, url: routePath, config: { operationId }, handler }
}
