import type { FastifyPluginCallback } from 'fastify'
import { sql } from 'kysely'
import type { Schema } from '@draftroom/contract'
import { migrationStatus } from '../../db/migrate.ts'
import { sendProblem } from '../problem.ts'
import type { RouteDependencies } from './dependencies.ts'
import { operationRoute } from '../operation-route.ts'

export const healthRoutes: FastifyPluginCallback<RouteDependencies> = (app, { contract, database }, done) => {
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
