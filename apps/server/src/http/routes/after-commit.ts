import type { FastifyRequest } from 'fastify'

/**
 * Runs what has to follow a committed change (telling the connections that are open) and logs a failure of it: the
 * change stands, and the person who asked has nothing to undo, so the answer is still the change's.
 */
export async function afterCommit(request: FastifyRequest, what: string, task: () => Promise<void>): Promise<void> {
  try {
    await task()
  } catch (error) {
    request.log.error({ err: error }, `${what} failed after the change was committed`)
  }
}
