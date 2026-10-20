import { screen, within } from '@testing-library/react'
import type { DataSource } from '../../../data/DataSource.ts'
import { ApiError } from '../../../data/errors.ts'
import { renderScreen, fixtures } from '../../documents/testing/renderScreen.tsx'

export { fixtures, renderScreen }

/** The two archived documents of the mock workspace, most recently changed first, as the contract orders them. */
export const archived = { first: fixtures.oldPricingSpanish, second: fixtures.oldPricing }

export const main = () => screen.getByRole('main')
/** The row of a document in the list. Its name is the title and then the line under it, so it is found by how it starts. */
export const row = (title: string) => within(main()).getByRole('button', { name: (name) => name.startsWith(title) })
/** The same, to wait for it, and to check that it is not there. */
export const findRow = (title: string) =>
  within(main()).findByRole('button', { name: (name) => name.startsWith(title) })
export const queryRow = (title: string) =>
  within(main()).queryByRole('button', { name: (name) => name.startsWith(title) })
/** The row that is selected, the one the list says is the current one. */
export const selectedRow = () => within(main()).getByRole('button', { current: true })
/** The panel of the selected document: the region that its title names. */
export const panel = (title: string) => within(main()).getByRole('region', { name: title })
export const panelButton = (title: string, name: 'Restore' | 'Delete permanently') =>
  within(panel(title)).getByRole('button', { name })
/** What the live regions of the work area say now. */
export const spoken = () =>
  within(main())
    .getAllByRole('status')
    .map((region) => region.textContent)

export const answer = (status: number, code: ApiError['code']) =>
  new ApiError({ type: 'about:blank', title: 'Refused', status, code })

/** A page of one document, so that "Load more" is there as soon as the first row is. */
export const onePerPage = (dataSource: DataSource): DataSource => ({
  ...dataSource,
  listDocuments: (request) =>
    dataSource.listDocuments({
      params: {
        path: { workspaceId: request?.params.path.workspaceId ?? '' },
        query: { ...request?.params.query, limit: 1 },
      },
    }),
})

/** Opens the trash and waits until its rows are there. */
export async function openTrash(options?: { wrap?: (dataSource: DataSource) => DataSource; signedInAs?: string }) {
  const view = renderScreen('/trash', options)
  await findRow(archived.second.title)
  return view
}
