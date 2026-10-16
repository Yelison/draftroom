import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/tables.ts'
import type { AuthProvider } from './auth/auth-provider.ts'
import { requireAuthentication } from './auth/authenticate.ts'
import { loadContract, type Contract } from './contract.ts'
import type { DocumentBroadcaster } from './document-broadcaster.ts'
import type { LiveAccess } from './live-access.ts'
import {
  clearHeaders,
  handleError,
  handleFrameworkError,
  handleNotFound,
  problemBody,
  problemMediaType,
  sendProblem,
} from './problem.ts'
import { accessRoutes } from './routes/access.ts'
import { commentRoutes } from './routes/comments.ts'
import { documentRoutes } from './routes/documents.ts'
import { folderRoutes } from './routes/folders.ts'
import { healthRoutes } from './routes/health.ts'
import { memberRoutes } from './routes/members.ts'
import { pinRoutes } from './routes/pins.ts'
import { workspaceRoutes } from './routes/workspaces.ts'

declare module 'fastify' {
  interface FastifyInstance {
    /** The operations of the contract that have a route in this app, read from the routes themselves. */
    readonly implementedOperations: ReadonlySet<string>
  }
}

/** A response that left a handler without following the contract. The client never sees the detail. */
export interface ContractViolation {
  readonly operationId: string
  readonly status: number
  readonly reason: string
}

export interface AppDependencies {
  readonly database: Kysely<Database>
  /** Who the callers are. Required: an app without one would have to choose between serving everyone and no one. */
  readonly authProvider: AuthProvider
  /** Who hears about a change to a document that people have open. Required, so that an app cannot forget to tell them. */
  readonly broadcaster: DocumentBroadcaster
  /** Who holds open connections to account for a change of access. Required for the same reason: forgetting it leaves a revoked person connected. */
  readonly liveAccess: LiveAccess
  /** Compiled once; build it at start-up and share it (compiling takes a moment). */
  readonly contract?: Contract
  readonly logger?: FastifyServerOptions['logger']
  /** Called for every response that breaks the contract, besides logging it. The tests use it to fail loudly. */
  readonly onContractViolation?: (violation: ContractViolation) => void
}

/** The REST application. Nothing is listening: tests drive it with `inject()`, the entry point calls `listen()`. */
export function buildApp({
  database,
  authProvider,
  broadcaster,
  liveAccess,
  contract = loadContract(),
  logger = false,
  onContractViolation,
}: AppDependencies): FastifyInstance {
  // The contract has no HEAD operations, so none is exposed.
  const app = Fastify({ logger, exposeHeadRoutes: false, frameworkErrors: handleFrameworkError })
  const implementedOperations = new Set<string>()
  app.decorate('implementedOperations', implementedOperations)

  app.setErrorHandler(handleError)
  app.setNotFoundHandler(handleNotFound)

  app.addHook('onRoute', ({ config }) => {
    if (config?.operationId !== undefined) implementedOperations.add(config.operationId)
  })

  // First and second in the order of checks: the session and the CSRF token.
  requireAuthentication(app, contract, authProvider)

  // Third in the order of checks, after the session and the CSRF token: the shape of the request, the same whether or
  // not the resource exists.
  app.addHook('preHandler', async (request, reply) => {
    const operationId = request.routeOptions.config.operationId
    if (operationId === undefined) return
    const verdict = contract.operation(operationId).checkRequest({
      params: request.params,
      query: request.query,
      body: request.body,
    })
    if (!verdict.ok)
      return sendProblem(reply, verdict.status === 413 ? 'too-large' : 'validation-failed', { errors: verdict.errors })
  })

  // What leaves the server is checked as it leaves, bytes and all. A response that breaks the contract is a bug of the
  // server, so it becomes a 500; the fixed body below is not checked again, which would loop.
  app.addHook('onSend', async (request, reply, payload) => {
    const operationId = request.routeOptions.config.operationId
    if (operationId === undefined) return payload
    const contentType = reply.getHeader('content-type')
    const verdict = contract
      .operation(operationId)
      .checkResponse(reply.statusCode, typeof contentType === 'string' ? contentType : undefined, payload)
    if (verdict.ok) return payload

    const violation = { operationId, status: reply.statusCode, reason: verdict.reason }
    request.log.error(violation, 'the response breaks the contract')
    onContractViolation?.(violation)
    clearHeaders(reply)
    reply.code(500).type(problemMediaType)
    return JSON.stringify(problemBody('internal-error'))
  })

  const dependencies = { contract, database, broadcaster, liveAccess }
  for (const routes of [
    healthRoutes,
    workspaceRoutes,
    memberRoutes,
    folderRoutes,
    documentRoutes,
    accessRoutes,
    pinRoutes,
    commentRoutes,
  ]) {
    void app.register(routes, dependencies)
  }

  return app
}
