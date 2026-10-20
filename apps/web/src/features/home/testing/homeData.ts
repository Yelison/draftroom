import type { Schema } from '@draftroom/contract'
import { screen, within } from '@testing-library/react'
import { ApiError } from '../../../data/errors.ts'
import type { DataSource } from '../../../data/DataSource.ts'
import { seedId } from '../../../data/mock/ids.ts'
import { renderScreen } from '../../documents/testing/renderScreen.tsx'

/** The mock with some of its operations replaced: a call that fails, never answers or answers differently. */
export const overriding =
  (overrides: Partial<DataSource>) =>
  (dataSource: DataSource): DataSource => ({ ...dataSource, ...overrides })

export const unavailable = () =>
  new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })

export const never = () => new Promise<never>(() => undefined)

/** Fails the first call of an operation with a 503 and lets the later ones through. */
export const failingOnce =
  <Name extends 'listDocuments' | 'listPinnedDocuments' | 'listWorkspaceActivity' | 'listTemplates' | 'listFolders'>(
    name: Name,
  ) =>
  (dataSource: DataSource): DataSource => {
    let failures = 1
    return {
      ...dataSource,
      [name]: (request: Parameters<DataSource[Name]>[0]) =>
        failures-- > 0
          ? Promise.reject(unavailable())
          : (dataSource[name] as (request: unknown) => Promise<unknown>)(request),
    }
  }

export const main = () => screen.getByRole('main')

/** The screen of Home with the mock, signed in as Marta unless said, once its first section is drawn. */
export async function renderHome(options: Parameters<typeof renderScreen>[1] = {}) {
  const view = renderScreen('/', options)
  await within(main()).findByRole('region', { name: 'Start something new' })
  return view
}

/** `count` pinned documents, the first of the real ones copied under other ids and titles, in the order given. */
export const manyPinned =
  (count: number) =>
  (dataSource: DataSource): DataSource =>
    overriding({
      listPinnedDocuments: async (request) => {
        const page = await dataSource.listPinnedDocuments(request)
        const [template] = page.items
        if (template === undefined) throw new Error('The mock has no pinned document to copy')
        const items: Schema<'Document'>[] = Array.from({ length: count }, (_, index) => ({
          ...template,
          id: seedId(9, index + 1),
          title: `Pinned ${index + 1}`,
        }))
        return { ...page, items }
      },
    })(dataSource)
