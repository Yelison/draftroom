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

export function problemBody(code: ErrorCode, errors?: readonly FieldError[]): Problem {
  const { status, title } = catalogue[code]
  return {
    type: `/problems/${code}`,
    title,
    status,
    code,
    ...(errors === undefined || errors.length === 0 ? {} : { errors: [...errors] }),
  }
}

export function sendProblem(reply: FastifyReply, code: ErrorCode, errors?: readonly FieldError[]): FastifyReply {
  return reply.code(catalogue[code].status).type(problemMediaType).send(problemBody(code, errors))
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
  const status = error.statusCode ?? 500
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return sendProblem(reply, 'too-large')
  if (isParserError(error, status)) return sendProblem(reply, 'validation-failed', [wholeBody])
  const code = codeByStatus.get(status)
  if (code !== undefined) return sendProblem(reply, code)

  request.log.error({ err: error }, 'unhandled error')
  return sendProblem(reply, 'internal-error')
}

export function handleNotFound(_request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return sendProblem(reply, 'not-found')
}
