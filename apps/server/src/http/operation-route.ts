import type { operations } from '@draftroom/contract'
import type { FastifyReply, FastifyRequest, RouteHandlerMethod, RouteOptions } from 'fastify'
import type { Contract } from './contract.ts'

declare module 'fastify' {
  interface FastifyContextConfig {
    /** The `operationId` of the contract this route implements: what the request and response checks look up. */
    operationId?: string
  }
}

type Parameters<Id extends keyof operations, Place extends 'path' | 'query'> = NonNullable<
  operations[Id]['parameters'][Place]
>

type JsonContent<Body> = Body extends { content: { 'application/json': infer Json } } ? Json : never

/** The JSON body of an operation, which is also `undefined` when the contract lets the request leave it out. */
type JsonBody<Id extends keyof operations> =
  | JsonContent<operations[Id]['requestBody']>
  | ([JsonContent<operations[Id]['requestBody']>] extends [never]
      ? never
      : undefined extends operations[Id]['requestBody']
        ? undefined
        : never)

/** A request as the contract describes it: the path, the query and the body, typed by the operation's own schemas. */
export type OperationRequest<Id extends keyof operations> = FastifyRequest<{
  Params: Parameters<Id, 'path'>
  Querystring: Parameters<Id, 'query'>
  Body: JsonBody<Id>
}>

type OperationHandler<Id extends keyof operations> = (request: OperationRequest<Id>, reply: FastifyReply) => unknown

/**
 * A route whose method, path and checks all come from one operation of the contract, so a route cannot drift from the
 * file that documents it, and `GET /api/health/live` is written once. The handler receives the request typed by the
 * operation, which is safe because the contract's own check has already run by then (`app.ts`).
 */
export function operationRoute<Id extends keyof operations & string>(
  contract: Contract,
  operationId: Id,
  handler: OperationHandler<Id>,
): RouteOptions {
  const { method, routePath } = contract.operation(operationId)
  // The one cast of the routes: Fastify types a handler by its own generic defaults, and the request is validated and
  // coerced to the operation's types before the handler runs.
  return { method, url: routePath, config: { operationId }, handler: handler as RouteHandlerMethod }
}
