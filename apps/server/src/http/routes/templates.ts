import type { Schema } from '@draftroom/contract'
import type { FastifyPluginCallback } from 'fastify'
import { builtInTemplates } from '../../domain/templates/built-in.ts'
import { operationRoute } from '../operation-route.ts'
import type { RouteDependencies } from './dependencies.ts'

export const templateRoutes: FastifyPluginCallback<RouteDependencies> = (app, { contract }, done) => {
  app.route(
    operationRoute(contract, 'listTemplates', async (request): Promise<Schema<'TemplateList'>> => ({
      items: builtInTemplates
        .list(request.query.locale ?? 'en')
        .map(({ id, name, description }) => ({ id, name, description })),
    })),
  )

  done()
}
