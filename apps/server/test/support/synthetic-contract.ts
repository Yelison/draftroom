import type { RouteHandlerMethod, RouteOptions } from 'fastify'
import { operationShape, readContractDocument } from '../../src/http/contract-document.ts'
import { loadContract, type Contract } from '../../src/http/contract.ts'

/** The operation that exists only in the contract of these tests. It has no route in the server, and never in `openapi.yaml`. */
export const syntheticOperationId = 'probeSyntheticOperation'
export const syntheticPath = '/api/synthetic/probe'

/**
 * The contract of the repository plus one operation made up by the tests: a copy of `signIn` (no session, a JSON body, the
 * person as the answer, the same problems) at its own path. The checks of the app (an answer, a failure, a response that
 * breaks the contract) have to be seen with a handler the test brings, on an operation nobody has a route for, because a
 * route cannot be declared twice and the real ones need a database. Every real operation now has its route, so the
 * operation is added to a copy of the document in memory, which each test file compiles for itself.
 */
export function contractWithSyntheticOperation(): Contract {
  const document = readContractDocument()
  const signIn = operationShape.parse(document.paths['/api/auth/sign-in']?.['post'])
  document.paths[syntheticPath] = { post: { ...signIn, operationId: syntheticOperationId } }
  return loadContract(document)
}

/**
 * A route for the synthetic operation, shaped as `operationRoute` shapes one: its method and path from the contract, and
 * the `operationId` that makes the checks of the app apply to it. `operationRoute` itself is typed by the operations of
 * the generated types, which the operation of the tests is not among.
 */
export function syntheticRoute(contract: Contract, handler: RouteHandlerMethod): RouteOptions {
  const { method, routePath } = contract.operation(syntheticOperationId)
  return { method, url: routePath, config: { operationId: syntheticOperationId }, handler }
}
