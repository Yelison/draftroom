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

/** Maps anything the framework or a handler throws to a problem; only a `5xx` is logged, with its stack. */
export function handleError(error: FastifyError, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  const status = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500
  if (status === 413) return sendProblem(reply, 'too-large')
  // Malformed JSON, an empty body where JSON was declared, a media type the API does not read: the contract has no
  // 415 and no 422, so they are all the same request that breaks its rules.
  if (status >= 400 && status < 500) return sendProblem(reply, 'validation-failed', [wholeBody])

  request.log.error({ err: error }, 'unhandled error')
  return sendProblem(reply, 'internal-error')
}

export function handleNotFound(_request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return sendProblem(reply, 'not-found')
}
