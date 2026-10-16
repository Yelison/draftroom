import { z } from 'zod'
import { readContractDocument } from '../../src/http/contract-document.ts'

// The roles each operation allows, read from the contract's own `x-draftroom-roles`. A matrix test that takes its
// expectations from here cannot agree with the server by copying it: the contract is a second source, which its own
// tests hold to ADR 0005.

const rule = z.object({ row: z.string(), roles: z.array(z.string()), condition: z.literal('author').optional() })
const rules = z.object({
  scope: z.enum(['session', 'public', 'workspace', 'document']),
  rules: z.array(rule).default([]),
})
const operation = z.object({ operationId: z.string(), 'x-draftroom-roles': rules })

/** One row of the matrix as an operation lists it: who it lets in, and the condition besides the role, if any. */
export interface RoleRule {
  readonly row: string
  readonly roles: readonly string[]
  /** The row only applies to the person who wrote the thing it is about. */
  readonly condition?: 'author' | undefined
}

export interface OperationRoles {
  readonly scope: 'session' | 'public' | 'workspace' | 'document'
  /** Every role that some row lets in, whatever its condition. */
  readonly roles: readonly string[]
  readonly rules: readonly RoleRule[]
}

const byOperation = new Map<string, OperationRoles>()
for (const item of Object.values(readContractDocument().paths)) {
  for (const candidate of Object.values(item)) {
    const parsed = operation.safeParse(candidate)
    if (!parsed.success) continue
    const { scope, rules: found } = parsed.data['x-draftroom-roles']
    byOperation.set(parsed.data.operationId, {
      scope,
      roles: [...new Set(found.flatMap((rule) => rule.roles))],
      rules: found,
    })
  }
}

export function rolesOf(operationId: string): OperationRoles {
  const found = byOperation.get(operationId)
  if (found === undefined) throw new Error(`The contract has no roles for ${operationId}`)
  return found
}

/**
 * Whether the contract lets a person with this role do the operation: some row has to list the role, and a row that
 * needs the person to be the author needs them to be.
 */
export function contractAllows(operationId: string, role: string, { isAuthor }: { isAuthor: boolean }): boolean {
  return rolesOf(operationId).rules.some(
    (row) => row.roles.includes(role) && (row.condition === undefined || (row.condition === 'author' && isAuthor)),
  )
}
