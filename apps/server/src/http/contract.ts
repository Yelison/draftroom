import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import type { Schema } from '@draftroom/contract'
import {
  isReference,
  operationShape,
  readContractDocument,
  type ContractDocument,
  type Reference,
} from './contract-document.ts'
import { toFieldErrors, type RequestPart } from './field-errors.ts'

// Compiles a validator for every request and every response that openapi.yaml declares, once, when it is loaded.
// The same operations then guard the server (its own requests and responses) and the integration tests.

type FieldError = Schema<'FieldError'>

const httpMethods = [
  ['get', 'GET'],
  ['put', 'PUT'],
  ['post', 'POST'],
  ['patch', 'PATCH'],
  ['delete', 'DELETE'],
] as const
export type HttpMethod = (typeof httpMethods)[number][1]

const contractId = 'contract'
const jsonMediaTypes = new Set(['application/json', 'application/problem+json'])

/** The parts of a request the contract describes. */
export interface RequestParts {
  readonly params: unknown
  readonly query: unknown
  readonly body: unknown
}

/** `413` is for a text in the body over its limit, `400` for everything else. */
export type RequestVerdict =
  { readonly ok: true } | { readonly ok: false; readonly status: 400 | 413; readonly errors: readonly FieldError[] }

export type ResponseVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: string }

export interface ContractOperation {
  readonly id: string
  readonly method: HttpMethod
  /** The path as the contract writes it: `/api/documents/{documentId}`. */
  readonly path: string
  /** The same path in the form Fastify's router reads: `/api/documents/:documentId`. */
  readonly routePath: string
  /** Validates a request. Query and path values are coerced in place to the types the contract declares. */
  checkRequest(parts: RequestParts): RequestVerdict
  /** Validates a response as it leaves the server: its status, its media type and its body. */
  checkResponse(status: number, mediaType: string | undefined, payload: unknown): ResponseVerdict
}

export interface Contract {
  readonly operations: ReadonlyMap<string, ContractOperation>
  operation(id: string): ContractOperation
}

function rewriteRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewriteRefs)
  return typeof value === 'object' && value !== null ? absolutizeRefs(value) : value
}

/** Makes every `$ref` of a schema point into the registered contract, wherever the schema is compiled. */
function absolutizeRefs(schema: object): object {
  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key,
      key === '$ref' && typeof value === 'string' ? value.replace(/^#/, `${contractId}#`) : rewriteRefs(value),
    ]),
  )
}

function createAjv(schemas: ContractDocument['components']['schemas'], coerce: boolean): Ajv2020 {
  const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true, coerceTypes: coerce })
  addFormats.default(ajv)
  // Annotations the contract adds to its schemas; they do not validate anything.
  ajv.addVocabulary(['components', 'x-draftroom-restricted'])
  ajv.addSchema({ components: { schemas: absolutizeRefs(schemas) } }, contractId)
  return ajv
}

function resolve<T extends object>(candidate: T | Reference, table: Readonly<Record<string, T>>): T {
  if (!isReference(candidate)) return candidate
  const found = table[candidate.$ref.split('/').pop() ?? '']
  if (found === undefined) throw new Error(`The contract refers to ${candidate.$ref}, which it does not define`)
  return found
}

const describeErrors = (errors: readonly ErrorObject[] | null | undefined): string =>
  (errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message ?? error.keyword} ${JSON.stringify(error.params)}`)
    .join('; ')

function issues(part: RequestPart, validate: ValidateFunction | undefined, value: unknown): FieldError[] {
  return validate === undefined || validate(value) ? [] : toFieldErrors(part, validate.errors ?? [])
}

function textOf(payload: unknown): string | undefined {
  if (typeof payload === 'string') return payload
  return payload instanceof Uint8Array ? Buffer.from(payload).toString('utf8') : undefined
}

/** Compiles the contract of the repository, or `source` when a test brings a smaller one. */
export function loadContract(source: ContractDocument = readContractDocument()): Contract {
  const { paths, components } = source
  const bodyAjv = createAjv(components.schemas, false)
  const parameterAjv = createAjv(components.schemas, true)

  const compiled = new WeakMap<object, ValidateFunction>()
  const compile = (ajv: Ajv2020, schema: object): ValidateFunction => {
    const known = compiled.get(schema)
    if (known !== undefined) return known
    const validate = ajv.compile(absolutizeRefs(schema))
    compiled.set(schema, validate)
    return validate
  }

  const operations = new Map<string, ContractOperation>()

  for (const [path, item] of Object.entries(paths)) {
    for (const [key, method] of httpMethods) {
      const declaration = item[key]
      if (declaration === undefined) continue
      const declared = operationShape.parse(declaration)
      const parameters = (declared.parameters ?? []).map((candidate) => resolve(candidate, components.parameters))

      const named = (location: 'path' | 'query') => parameters.filter((candidate) => candidate.in === location)
      const objectOf = (declaredParameters: typeof parameters, extra: object) =>
        compile(parameterAjv, {
          type: 'object',
          properties: Object.fromEntries(declaredParameters.map((candidate) => [candidate.name, candidate.schema])),
          required: declaredParameters
            .filter((candidate) => candidate.required === true)
            .map((candidate) => candidate.name),
          ...extra,
        })
      // The router only hands over the path parameters the path has. A query is the caller's to write: a name the
      // operation does not declare is refused, like an unknown field of a body, so a typo is never a silent no-op.
      const pathValidator = named('path').length === 0 ? undefined : objectOf(named('path'), {})
      const queryValidator = objectOf(named('query'), { additionalProperties: false })

      const body =
        declared.requestBody === undefined ? undefined : resolve(declared.requestBody, components.requestBodies)
      const bodySchema = body?.content['application/json']?.schema
      const bodyValidator = bodySchema === undefined ? undefined : compile(bodyAjv, bodySchema)

      // status -> media type -> validator (undefined for a media type the server does not inspect, like bytes)
      const responses = new Map(
        Object.entries(declared.responses).map(([status, candidate]) => {
          const declaredResponse = resolve(candidate, components.responses)
          const media = Object.entries(declaredResponse.content ?? {}).map(([mediaType, { schema }]) => {
            const validate =
              jsonMediaTypes.has(mediaType) && schema !== undefined ? compile(bodyAjv, schema) : undefined
            return [mediaType, validate] as const
          })
          return [status, new Map(media)] as const
        }),
      )

      operations.set(declared.operationId, {
        id: declared.operationId,
        method,
        path,
        routePath: path.replaceAll(/\{([^}]+)\}/g, ':$1'),
        checkRequest(parts) {
          const missingBody = body?.required === true && parts.body === undefined
          const errors: FieldError[] = [
            ...issues('path', pathValidator, parts.params),
            ...issues('query', queryValidator, parts.query),
            ...(missingBody ? [{ pointer: '/', code: 'required' } as const] : []),
            ...(parts.body === undefined ? [] : issues('body', bodyValidator, parts.body)),
          ]
          if (errors.length === 0) return { ok: true }
          const textTooLong = errors.some(
            (error) => error.code === 'too-long' && !/^\/(query|path)\//.test(error.pointer),
          )
          return { ok: false, status: textTooLong ? 413 : 400, errors }
        },
        checkResponse(status, mediaType, payload) {
          const media = responses.get(String(status)) ?? responses.get('default')
          if (media === undefined) return { ok: false, reason: `status ${status} is not declared` }
          if (media.size === 0) {
            const empty = payload === undefined || payload === null || payload === ''
            return empty ? { ok: true } : { ok: false, reason: `status ${status} declares no body` }
          }
          const type = mediaType?.split(';')[0]?.trim().toLowerCase() ?? ''
          if (!media.has(type))
            return { ok: false, reason: `status ${status} does not declare the media type "${type}"` }
          const validate = media.get(type)
          if (validate === undefined) return { ok: true }
          const text = textOf(payload)
          if (text === undefined) return { ok: false, reason: 'a JSON response must be sent as text' }
          try {
            return validate(JSON.parse(text)) ? { ok: true } : { ok: false, reason: describeErrors(validate.errors) }
          } catch {
            return { ok: false, reason: 'the body is not valid JSON' }
          }
        },
      })
    }
  }

  return {
    operations,
    operation(id) {
      const found = operations.get(id)
      if (found === undefined) throw new Error(`The contract has no operation "${id}"`)
      return found
    },
  }
}
