/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { parse } from 'yaml'
import type { DataSource } from '../DataSource.ts'
import { isApiError } from '../errors.ts'

// Run-time proof that the mock answers what `openapi.yaml` says. Resolve's mocks were checked against its types when
// compiled; these are checked against the schemas themselves, on every response, so a missing field, a wrong enum or a
// status the operation does not declare fails the test that caused it. Only tests import this module: it brings a YAML
// parser and a schema validator that must never reach the bundle.

const methods = ['get', 'put', 'post', 'delete', 'patch'] as const
const root = 'https://draftroom.example/openapi.json'
const openApiPath = resolve(import.meta.dirname, '../../../../../packages/contract/openapi.yaml')

export interface Outcome {
  status: number
  /** The parsed body of the answer; `undefined` when there is none (`204`). */
  body: unknown
}

interface Operation {
  id: string
  method: string
  path: string
  /** The statuses the operation declares, `default` included. */
  statuses: string[]
}

export interface Contract {
  operations: readonly Operation[]
  /** The problems of an answer against its operation's declared responses; none means the answer is valid. */
  check(operationId: string, outcome: Outcome): string[]
  /** The one `2xx` the operation declares. */
  successStatus(operationId: string): number
  /** A schema of `components/schemas` as the document writes it, for tests that pin a constant of the client to it. */
  schema(name: string): Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const escapePointer = (segment: string) => segment.replaceAll('~', '~0').replaceAll('/', '~1')

export function loadContract(): Contract {
  const document: unknown = parse(readFileSync(openApiPath, 'utf8'))
  if (!isRecord(document) || !isRecord(document.paths)) throw new Error('openapi.yaml has no paths')

  // Strict mode stays on, so a keyword the validator does not know is an error, not a silently ignored constraint.
  // The document as a whole is not a schema: its parts are reached by pointer and `$ref`, so its top-level members are
  // declared as annotations, and so is the contract's own extension, `x-draftroom-restricted`. None constrains a value.
  const ajv = new Ajv2020({ strict: true, allErrors: true })
  addFormats(ajv)
  for (const keyword of ['openapi', 'info', 'servers', 'tags', 'paths', 'components', 'x-draftroom-restricted']) {
    ajv.addKeyword(keyword)
  }
  ajv.addSchema({ $id: root, ...document })

  const { paths } = document
  const operations: Operation[] = Object.entries(paths).flatMap(([path, item]) =>
    isRecord(item)
      ? methods.flatMap((method) => {
          const operation = item[method]
          if (!isRecord(operation) || typeof operation.operationId !== 'string' || !isRecord(operation.responses))
            return []
          return [{ id: operation.operationId, method, path, statuses: Object.keys(operation.responses) }]
        })
      : [],
  )

  /** The JSON pointer of the response object of one status, following a `$ref` into `components/responses`. */
  function responsePointer(operation: Operation, status: string): string {
    const item = paths[operation.path]
    const declaration = isRecord(item) ? item[operation.method] : undefined
    const responses = isRecord(declaration) && isRecord(declaration.responses) ? declaration.responses : {}
    const response = responses[status]
    return isRecord(response) && typeof response.$ref === 'string'
      ? response.$ref.replace(/^#/, '')
      : `/paths/${escapePointer(operation.path)}/${operation.method}/responses/${status}`
  }

  const find = (operationId: string) => {
    const operation = operations.find((row) => row.id === operationId)
    if (operation === undefined) throw new Error(`The contract has no operation ${operationId}`)
    return operation
  }

  const schemas =
    isRecord(document.components) && isRecord(document.components.schemas) ? document.components.schemas : {}

  return {
    operations,

    schema(name) {
      const schema = schemas[name]
      if (!isRecord(schema)) throw new Error(`The contract has no schema ${name}`)
      return schema
    },

    successStatus(operationId) {
      const status = find(operationId).statuses.filter((declared) => declared.startsWith('2'))
      if (status.length !== 1 || status[0] === undefined)
        throw new Error(`${operationId} does not declare exactly one 2xx`)
      return Number(status[0])
    },

    check(operationId, { status, body }) {
      const operation = find(operationId)
      // `default` is the catch-all for unexpected failures only: any other status has to be declared by name.
      const declared = operation.statuses.includes(String(status))
        ? String(status)
        : status >= 500 && operation.statuses.includes('default')
          ? 'default'
          : undefined
      if (declared === undefined) return [`${operationId} does not declare a ${status} response`]

      const mediaType = status >= 400 ? 'application/problem+json' : 'application/json'
      const pointer = `${responsePointer(operation, declared)}/content/${escapePointer(mediaType)}/schema`
      const validate = ajv.getSchema(`${root}#${pointer}`)
      if (validate === undefined) {
        return body === undefined
          ? []
          : [`${operationId} declares no ${mediaType} body for ${status}, but one was sent`]
      }
      return validate(body)
        ? []
        : (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? ''}`)
    },
  }
}

/** A failed contract check, with the operation, the answer and what was wrong with it. */
export class ContractViolation extends Error {
  constructor(operationId: string, outcome: Outcome, problems: readonly string[]) {
    super(`${operationId} answered ${outcome.status} against the contract:\n${problems.join('\n')}`)
    this.name = 'ContractViolation'
  }
}

/**
 * The same data source, checking every answer against the contract before handing it over: a success against the schema
 * of the operation's `2xx`, a refusal against the response it declares for its status. Any mismatch throws
 * `ContractViolation` in place of the answer.
 */
export function checkedAgainstContract(source: DataSource, contract: Contract): DataSource {
  const known = new Set(contract.operations.map((operation) => operation.id))
  return new Proxy(source, {
    get(target, property, receiver) {
      const method: unknown = Reflect.get(target, property, receiver)
      if (typeof property !== 'string' || typeof method !== 'function' || !known.has(property)) return method

      return async (...args: unknown[]) => {
        const verify = (outcome: Outcome) => {
          const problems = contract.check(property, outcome)
          if (problems.length > 0) throw new ContractViolation(property, outcome, problems)
        }
        let result: unknown
        try {
          result = await Reflect.apply(method, target, args)
        } catch (error) {
          if (isApiError(error)) verify({ status: error.status, body: error.problem })
          throw error
        }
        // The version download is bytes, not JSON: nothing in the schemas describes it.
        if (!(result instanceof Uint8Array)) verify({ status: contract.successStatus(property), body: result })
        return result
      }
    },
  })
}
