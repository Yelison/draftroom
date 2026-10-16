import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import type { ErrorCode, Problem, Schema } from '@draftroom/contract'

type FieldError = Schema<'FieldError'>

export const problemMediaType = 'application/problem+json'

// What each stable code means on the wire. The titles are short English summaries for logs: clients choose the text
// a person reads from `code`, in the person's language.
const catalogue: Readonly<Record<ErrorCode, { readonly status: number; readonly title: string }>> = {
  'validation-failed': { status: 400, title: 'The request is not valid.' },
  unauthenticated: { status: 401, title: 'Authentication is required.' },
  csrf: { status: 403, title: 'The CSRF token is missing or wrong.' },
  forbidden: { status: 403, title: 'This role cannot do that.' },
  'not-found': { status: 404, title: 'Not found.' },
  'revision-conflict': { status: 409, title: 'The resource changed since it was read.' },
  'last-owner': { status: 409, title: 'The last owner cannot be removed or demoted.' },
  conflict: { status: 409, title: 'The request conflicts with the current state.' },
  'too-large': { status: 413, title: 'A value exceeds its limit.' },
  'rate-limited': { status: 429, title: 'Too many requests.' },
  'internal-error': { status: 500, title: 'Something went wrong.' },
  unavailable: { status: 503, title: 'The server is not ready.' },
}

/** What a problem can carry besides its code: the fields at fault, or the resource a stale revision lost against. */
export interface ProblemDetails {
  readonly errors?: readonly FieldError[]
  /** The resource as the server holds it now, for a `revision-conflict`. */
  readonly current?: Schema<'Document'> | Schema<'Folder'>
}

/** A `Problem`, or the `revision-conflict` variant that adds `current`. */
export type ProblemBody = Problem & Pick<ProblemDetails, 'current'>

export function problemBody(code: ErrorCode, { errors, current }: ProblemDetails = {}): ProblemBody {
  const { status, title } = catalogue[code]
  return {
    type: `/problems/${code}`,
    title,
    status,
    code,
    ...(errors === undefined || errors.length === 0 ? {} : { errors: [...errors] }),
    ...(current === undefined ? {} : { current }),
  }
}

export function sendProblem(reply: FastifyReply, code: ErrorCode, details?: ProblemDetails): FastifyReply {
  return reply.code(catalogue[code].status).type(problemMediaType).send(problemBody(code, details))
}

/**
 * An answer the contract defines, thrown from anywhere below a handler (a loader, a transaction) so that the handler
 * reads straight down. Throwing inside a transaction also rolls it back, which a `reply.send` could not do. Anything
 * else that is thrown is a bug of the server and still leaves as a 500.
 */
export class ProblemError extends Error {
  readonly code: ErrorCode
  readonly details: ProblemDetails

  constructor(code: ErrorCode, details: ProblemDetails = {}) {
    super(`The request is answered with ${code}`)
    this.name = 'ProblemError'
    this.code = code
    this.details = details
  }
}

/**
 * Strips what a handler put on a response the server is about to replace by a 500: a session cookie, an ETag, a
 * Location must not outlive the answer that was refused. Fastify adds the content length itself afterwards.
 */
export function clearHeaders(reply: FastifyReply): void {
  for (const name of Object.keys(reply.getHeaders())) reply.removeHeader(name)
}

/** The body is unreadable as a whole: its pointer is the document itself. */
const wholeBody: FieldError = { pointer: '/', code: 'invalid-format' }

// The statuses a handler may throw as plain HTTP errors, with the code the contract gives each. Anything else a handler
// throws is a bug of the server, not an answer the contract defines.
const codeByStatus: ReadonlyMap<number, ErrorCode> = new Map([
  [401, 'unauthenticated'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [409, 'conflict'],
])

// Fastify's content-type parser: malformed JSON, an empty body where JSON was declared (400), a media type the API does
// not read (415). The contract has no 415 and no 422, so they are all the same request that breaks its rules.
const isParserError = (error: FastifyError, status: number): boolean =>
  typeof error.code === 'string' && error.code.startsWith('FST_ERR_CTP_') && (status === 400 || status === 415)

/** Maps what the framework or a handler throws to a problem; what the contract does not define is a 500, logged. */
export function handleError(error: FastifyError, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  if (error instanceof ProblemError) return sendProblem(reply, error.code, error.details)
  const status = error.statusCode ?? 500
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return sendProblem(reply, 'too-large')
  if (isParserError(error, status)) return sendProblem(reply, 'validation-failed', { errors: [wholeBody] })
  const code = codeByStatus.get(status)
  if (code !== undefined) return sendProblem(reply, code)

  request.log.error({ err: error }, 'unhandled error')
  clearHeaders(reply)
  return sendProblem(reply, 'internal-error')
}

/**
 * Fastify's own errors, raised before a route is chosen (a URL that cannot be decoded, for one), which would otherwise
 * leave as Fastify's default JSON and break the `Problem` of the contract.
 */
export function handleFrameworkError(error: FastifyError, request: FastifyRequest, reply: FastifyReply): void {
  if (error.code === 'FST_ERR_BAD_URL') {
    sendProblem(reply, 'validation-failed', { errors: [wholeBody] })
    return
  }
  request.log.error({ err: error }, 'framework error')
  sendProblem(reply, 'internal-error')
}

export function handleNotFound(_request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return sendProblem(reply, 'not-found')
}
