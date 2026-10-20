import { screen, within } from '@testing-library/react'
import { renderScreen, type RenderScreenOptions } from '../../documents/testing/renderScreen.tsx'

export { renderScreen }
export { refusal } from '../../settings/testing/openSettings.tsx'

export const main = () => screen.getByRole('main')

/** Opens the Members page and waits until the table has arrived: the row of the first person is the sign of it. */
export async function openMembers(options?: RenderScreenOptions) {
  const view = renderScreen('/members', options)
  await within(main()).findByRole('table', { name: 'Members of the workspace' })
  return view
}

/** The row of a person, found by what it says: their name or, while they have no name yet, their address. */
export const rowOf = (name: string) => within(main()).getByRole('row', { name: new RegExp(name) })
export const roleOf = (name: string) => within(rowOf(name)).getByRole('combobox')
