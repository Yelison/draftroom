import { describe, expect, it } from 'vitest'
import { loadOpenApi } from './document.ts'

const document = loadOpenApi()
const { operations } = document

const problemJson = 'application/problem+json'
const isError = (status: string) => /^[45]/.test(status) || status === 'default'
const mediaTypesOf = (operation: (typeof operations)[number], status: string) => {
  const candidate = operation.responses[status]
  return candidate === undefined ? [] : Object.keys(document.resolveResponse(candidate).content ?? {})
}

describe('errors', () => {
  it('give every operation a default problem+json response', () => {
    const without = operations.filter((operation) => !mediaTypesOf(operation, 'default').includes(problemJson))

    expect(without.map((operation) => operation.key)).toEqual([])
  })

  it('send every error response as problem+json and nothing else', () => {
    const offenders = operations.flatMap((operation) =>
      Object.keys(operation.responses)
        .filter(isError)
        .filter((status) => mediaTypesOf(operation, status).join() !== problemJson)
        .map((status) => `${operation.key} ${status}`),
    )

    expect(offenders).toEqual([])
  })

  it('report a client error on every operation but the health probes', () => {
    const silent = operations
      .filter((operation) => !operation.path.startsWith('/api/health/'))
      .filter((operation) => !Object.keys(operation.responses).some((status) => status.startsWith('4')))

    expect(silent.map((operation) => operation.key)).toEqual([])
  })

  // Not found and forbidden stay apart: a resource the caller cannot read is 404, one they can read but not use is 403.
  it('answer 404 wherever an identifier is in the path', () => {
    const missing = operations
      .filter((operation) => operation.path.includes('{'))
      .filter((operation) => operation.responses['404'] === undefined)

    expect(missing.map((operation) => operation.key)).toEqual([])
  })

  it('answer 403 wherever a role decides', () => {
    const missing = operations
      .filter((operation) => ['document', 'workspace'].includes(operation.access?.scope ?? ''))
      .filter((operation) => operation.responses['403'] === undefined)

    expect(missing.map((operation) => operation.key)).toEqual([])
  })

  it('answer 409 last-owner where the last owner could be removed', () => {
    const lastOwner = operations
      .filter((operation) => {
        const conflict = operation.responses['409']
        return conflict !== undefined && '$ref' in conflict && conflict.$ref === '#/components/responses/LastOwner'
      })
      .map((operation) => operation.id)

    expect(lastOwner.sort()).toEqual(['removeAccess', 'removeMember', 'setAccess', 'updateMember'])
  })
})
