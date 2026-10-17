import type { FastifyInstance, FastifyReply } from 'fastify'
import { createKeyedBuckets, type BucketRule } from '../rate-limit/keyedBuckets.ts'
import { principalOf } from './auth/authenticate.ts'
import { sendProblem } from './problem.ts'

export interface RequestLimits {
  /** Everything one network address sends, signed in or not. */
  readonly perAddress: BucketRule
  /** Everything one session sends, whatever the address. */
  readonly perSession: BucketRule
}

/**
 * Two limits, both a bucket that refills (ADR 0017), so that a person who works fast is never told to wait and a loop is.
 *
 * - **A session**: ten requests a second for ever, and a hundred at once. The editor does not use REST for what is typed
 *   (that is the WebSocket); REST is a page that loads, a search that answers as the person types, a title that is saved.
 *   A hundred at once is several screens opened in a row; ten a second is more than a hand can do and a script can.
 * - **An address**: fifty a second and five hundred at once, five times a session's, because an office or a household
 *   shares one. It counts requests nobody signed in for too, which is what keeps an unauthenticated flood off the database.
 *
 * Behind a reverse proxy the address is the proxy's until `TRUST_PROXY` says otherwise, and the one limit is then everybody's.
 */
export const defaultRequestLimits: RequestLimits = {
  perAddress: { perSecond: 50, burst: 500 },
  perSession: { perSecond: 10, burst: 100 },
}

/** How many addresses and sessions are remembered at once; a bucket is a few dozen bytes. */
const rememberedKeys = 100_000

/** The probes of an orchestrator or a proxy come from one address, every few seconds, and must never be refused. */
const unlimitedOperations: ReadonlySet<string> = new Set(['getLiveness', 'getReadiness'])

function refuse(reply: FastifyReply, seconds: number): FastifyReply {
  return sendProblem(reply.header('retry-after', seconds), 'rate-limited')
}

/**
 * The limit by address, ahead of the session check: refusing is cheaper than finding out who the caller is. Registered on
 * `onRequest`, which runs before the body is read, so a flood is refused without being parsed.
 */
export function limitByAddress(app: FastifyInstance, { perAddress }: RequestLimits): void {
  const buckets = createKeyedBuckets({ ...perAddress, now: Date.now, maxKeys: rememberedKeys })
  app.addHook('onRequest', async (request, reply) => {
    if (unlimitedOperations.has(request.routeOptions.config.operationId ?? '')) return
    const wait = buckets.take(`address:${request.ip}`)
    if (wait !== null) return refuse(reply, wait)
  })
}

/**
 * The limit by session, once the caller is known. It must be registered after `requireAuthentication`, whose hook sets
 * the principal. A caller with no session of their own (the development identity) is counted as the person.
 */
export function limitBySession(app: FastifyInstance, { perSession }: RequestLimits): void {
  const buckets = createKeyedBuckets({ ...perSession, now: Date.now, maxKeys: rememberedKeys })
  app.addHook('onRequest', async (request, reply) => {
    if (request.principal === null) return
    const { sessionId, userId } = principalOf(request)
    const wait = buckets.take(sessionId === undefined ? `user:${userId}` : `session:${sessionId}`)
    if (wait !== null) return refuse(reply, wait)
  })
}
