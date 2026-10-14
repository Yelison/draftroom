import type { FastifyPluginCallback } from 'fastify'
import { sql, type Kysely } from 'kysely'
import type { Schema } from '@draftroom/contract'
import type { Database } from '../../db/tables.ts'
import { migrationStatus } from '../../db/migrate.ts'
import { sendProblem } from '../problem.ts'
import type { Contract } from '../contract.ts'
import { operationRoute } from '../operation-route.ts'

interface HealthOptions {
  readonly contract: Contract
  readonly database: Kysely<Database>
}

export const healthRoutes: FastifyPluginCallback<HealthOptions> = (app, { contract, database }, done) => {
  // Liveness never looks at the database: a database outage must not make an orchestrator restart a healthy process.
  app.route(operationRoute(contract, 'getLiveness', () => ({ status: 'ok' }) satisfies Schema<'LiveStatus'>))

  app.route(
    operationRoute(contract, 'getReadiness', async (request, reply) => {
      try {
        await sql`select 1`.execute(database)
      } catch (error) {
        request.log.warn({ err: error }, 'readiness: the database is unreachable')
        return sendProblem(reply, 'unavailable')
      }
      const migrations = await migrationStatus(database)
      if (!migrations.current) {
        request.log.warn({ reason: migrations.reason }, 'readiness: the migrations are not current')
        return sendProblem(reply, 'unavailable')
      }
      return { status: 'ok', database: 'up', migrations: 'current' } satisfies Schema<'ReadyStatus'>
    }),
  )

  done()
}
