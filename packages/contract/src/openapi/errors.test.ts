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

  // A 403 is a promise the server can break: it belongs where a role can be refused or the CSRF token can be wrong. A read
  // open to every role of its scope answers 404 to whoever cannot read, never 403.
  it('answer 403 only where a role can be refused or a token checked', () => {
    const scopeRoles: Record<string, string[]> = {
      document: ['viewer', 'commenter', 'editor', 'owner'],
      workspace: ['member', 'owner'],
    }
    const expected = (operation: (typeof operations)[number]) => {
      const publicOperation = operation.security?.length === 0
      const changesState = operation.method !== 'get' && !publicOperation
      const rules = operation.access?.rules ?? []
      const granted = new Set(rules.flatMap((rule) => rule.roles))
      const everyRoleAllowed = (scopeRoles[operation.access?.scope ?? ''] ?? []).every((role) => granted.has(role))
      const refusesSomeone =
        rules.length > 0 && (rules.some((rule) => rule.condition !== undefined) || !everyRoleAllowed)
      return changesState || refusesSomeone
    }

    const mismatched = operations.filter(
      (operation) => (operation.responses['403'] !== undefined) !== expected(operation),
    )

    expect(mismatched.map((operation) => operation.key)).toEqual([])
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

  describe('references to other resources', () => {
    const description = (id: string) => operations.find((operation) => operation.id === id)?.description ?? ''

    it.each(['createDocument', 'updateDocument'])(
      'treats an unknown or foreign folder as invalid-value in %s',
      (id) => {
        expect(description(id)).toContain(
          'unknown, or belongs to another workspace, is a `400 validation-failed` with `invalid-value`',
        )
      },
    )

    it('answers 404 to a grant for someone outside the workspace', () => {
      expect(description('setAccess')).toContain('anyone else is a `404 not-found`')
    })
  })
})
