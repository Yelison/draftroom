import { screen, within } from '@testing-library/react'
import type { DataSource } from '../../../data/DataSource.ts'
import { ApiError } from '../../../data/errors.ts'
import { daniel } from '../../../data/mock/fixtures/index.ts'
import { renderScreen } from '../../documents/testing/renderScreen.tsx'

export { renderScreen }

/** Daniel is the person who has things shared with him: he edits, comments on and reads documents of Marta's. */
export const sharedWithDaniel = daniel.email

export const main = () => screen.getByRole('main')
export const filters = () => within(main()).getByRole('group', { name: 'Filter by permission' })
export const answer = (status: number, code: ApiError['code']) =>
  new ApiError({ type: 'about:blank', title: 'Refused', status, code })

/** The titles in the table, top to bottom. */
export const titles = () =>
  within(within(main()).getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent)

/** Opens "Shared" as Daniel and waits for the table. */
export async function openShared(
  path = '/shared',
  options?: { wrap?: (dataSource: DataSource) => DataSource; signedInAs?: string },
) {
  const view = renderScreen(path, { signedInAs: sharedWithDaniel, ...options })
  await within(main()).findByRole('table')
  return view
}
