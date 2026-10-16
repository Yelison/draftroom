import { z } from 'zod'
import { readContractDocument } from '../../src/http/contract-document.ts'

// The roles each operation allows, read from the contract's own `x-draftroom-roles`. A matrix test that takes its
// expectations from here cannot agree with the server by copying it: the contract is a second source, which its own
// tests hold to ADR 0005.

const rules = z.object({
  scope: z.enum(['session', 'public', 'workspace', 'document']),
  rules: z.array(z.object({ roles: z.array(z.string()) })).default([]),
})
const operation = z.object({ operationId: z.string(), 'x-draftroom-roles': rules })

export interface OperationRoles {
  readonly scope: 'session' | 'public' | 'workspace' | 'document'
  readonly roles: readonly string[]
}

const byOperation = new Map<string, OperationRoles>()
for (const item of Object.values(readContractDocument().paths)) {
  for (const candidate of Object.values(item)) {
    const parsed = operation.safeParse(candidate)
    if (!parsed.success) continue
    const { scope, rules: found } = parsed.data['x-draftroom-roles']
    byOperation.set(parsed.data.operationId, { scope, roles: [...new Set(found.flatMap((rule) => rule.roles))] })
  }
}

export function rolesOf(operationId: string): OperationRoles {
  const found = byOperation.get(operationId)
  if (found === undefined) throw new Error(`The contract has no roles for ${operationId}`)
  return found
}
