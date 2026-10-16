import type { FastifyInstance, InjectOptions } from 'fastify'
import type { Contract, ContractOperation } from '../../src/http/contract.ts'
import type { ContractViolation } from '../../src/http/app.ts'
import type { ContractCoverage } from './contract-coverage.ts'

/** A request or a response that does not follow the contract: the test that caused it fails. */
export class ContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContractError'
  }
}

const patternOf = (operation: ContractOperation): RegExp =>
  new RegExp(`^${operation.routePath.replaceAll(/:[^/]+/g, '[^/]+')}$`)

/** The operation a request is for: the one with the same method whose path template matches. */
export function findOperation(contract: Contract, method: string, url: string): ContractOperation | undefined {
  const pathname = url.split('?')[0] ?? url
  return [...contract.operations.values()].find(
    (operation) => operation.method === method.toUpperCase() && patternOf(operation).test(pathname),
  )
}

export interface ContractResponse {
  readonly operationId: string
  readonly statusCode: number
  readonly headers: Readonly<Record<string, unknown>>
  readonly body: unknown
  /** The bytes as they were sent: `body` is text, which would damage a binary answer. */
  readonly rawBody: Buffer
}

/**
 * Sends requests to an app through `inject()` and holds every answer to the contract: the status, the media type and
 * the body must be declared by the operation the request is for. It also fails when the server itself reported that it
 * had to replace a response, because the replacement (a 500) is a valid answer and would pass the check by itself.
 */
export function createContractClient(
  app: FastifyInstance,
  contract: Contract,
  coverage: ContractCoverage,
  violations: readonly ContractViolation[],
) {
  return {
    async request(options: InjectOptions & { method: string; url: string }): Promise<ContractResponse> {
      const operation = findOperation(contract, options.method, options.url)
      if (operation === undefined) {
        throw new ContractError(`${options.method} ${options.url} is not an operation of the contract`)
      }

      const earlier = violations.length
      const response = await app.inject(options)

      const reported = violations.slice(earlier).at(0)
      if (reported !== undefined) {
        throw new ContractError(`The server answered ${reported.operationId} against the contract: ${reported.reason}`)
      }
      const verdict = operation.checkResponse(
        response.statusCode,
        response.headers['content-type']?.toString(),
        response.body,
      )
      if (!verdict.ok) {
        throw new ContractError(
          `${operation.id} answered ${response.statusCode} against the contract: ${verdict.reason}`,
        )
      }

      coverage.record(operation.id)
      const isJson = response.headers['content-type']?.toString().includes('json') === true
      return {
        operationId: operation.id,
        statusCode: response.statusCode,
        headers: response.headers,
        body: isJson ? response.json() : response.body,
        rawBody: response.rawPayload,
      }
    },
  }
}
