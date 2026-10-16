import { screen, within } from '@testing-library/react'
import type { DataSource } from '../../../data/DataSource.ts'
import { ApiError } from '../../../data/errors.ts'
import { renderScreen, fixtures } from '../../documents/testing/renderScreen.tsx'

export { fixtures, renderScreen }

/** The two archived documents of the mock workspace, most recently changed first, as the contract orders them. */
export const archived = { first: fixtures.oldPricingSpanish, second: fixtures.oldPricing }

export const main = () => screen.getByRole('main')
export const rowButton = (verb: 'Restore' | 'Delete', title: string, name = verb === 'Restore' ? '' : ' permanently') =>
  within(main()).getByRole('button', { name: `${verb} “${title}”${name}` })
/** What the live regions of the work area say now. */
export const spoken = () =>
  within(main())
    .getAllByRole('status')
    .map((region) => region.textContent)

export const answer = (status: number, code: ApiError['code']) =>
  new ApiError({ type: 'about:blank', title: 'Refused', status, code })

/** Opens the trash and waits until its rows are there. */
export async function openTrash(options?: { wrap?: (dataSource: DataSource) => DataSource; signedInAs?: string }) {
  const view = renderScreen('/trash', options)
  await within(main()).findByText(archived.second.title)
  return view
}
