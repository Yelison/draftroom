import type { OperationId } from '../DataSource.ts'

/**
 * Operations of the contract the mock does not implement, each with the reason. An operation that is neither
 * implemented nor listed here fails a test, and calling one of these fails loudly, so nothing is ever answered with a
 * made-up value.
 */
export const excludedOperations = {
  getLiveness: 'A probe for the orchestrator: the data source does not carry probes, so no screen can call it.',
  getReadiness: 'A probe for the orchestrator: the data source does not carry probes, so no screen can call it.',
  getVersionContent:
    'The bytes are a Yjs update. A valid one is a version the server kept of a document, and versions arrive with their own task (T5.1).',
} as const satisfies Partial<Record<OperationId | 'getLiveness' | 'getReadiness', string>>

export class UnhandledOperationError extends Error {
  constructor(operation: string) {
    super(`The mock does not implement ${operation}: ${reasonFor(operation)}`)
    this.name = 'UnhandledOperationError'
  }
}

function reasonFor(operation: string): string {
  const reasons: Record<string, string> = excludedOperations
  return reasons[operation] ?? 'it has no handler and no reason to be left out'
}

/**
 * The method of an operation the mock leaves out. It rejects with `UnhandledOperationError` and also reports it on the
 * console, so a screen that swallows the failure still leaves a trace that the end-to-end suite turns into a failure.
 */
export function unhandled(operation: string): () => Promise<never> {
  return async () => {
    const error = new UnhandledOperationError(operation)
    console.error(error.message)
    throw error
  }
}
