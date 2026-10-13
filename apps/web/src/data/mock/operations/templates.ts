import type { DataSource } from '../../DataSource.ts'
import { caller, type Context } from '../guards.ts'
import { sortRows } from '../pagination.ts'

type TemplateOperations = Pick<DataSource, 'listTemplates'>

export function templateOperations(ctx: Context): TemplateOperations {
  return {
    listTemplates: async (request) => {
      caller(ctx)
      const locale = request?.params?.query?.locale ?? 'en'
      const templates = ctx.world.templates.map(({ id, text }) => ({
        id,
        name: text[locale].name,
        description: text[locale].description,
      }))
      return { items: sortRows(templates, { key: (row) => row.id, id: (row) => row.id, direction: 'asc' }) }
    },
  }
}
