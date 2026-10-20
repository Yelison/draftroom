import { screen, within } from '@testing-library/react'
import { ApiError } from '../../../data/errors.ts'
import { renderScreen, type RenderScreenOptions } from '../../documents/testing/renderScreen.tsx'

export { renderScreen }

export const main = () => screen.getByRole('main')

/** A refusal the way the server gives it: the status and the stable code, with nothing that is meant for people. */
export const refusal = (status: number, code: ApiError['code']) =>
  new ApiError({ type: 'about:blank', title: 'Refused', status, code })

/** Opens a tab of Settings and waits until its panel has what it came for: the headline of the tab. */
export async function openTab(
  tab: 'profile' | 'workspace' | 'appearance',
  heading: string,
  options?: RenderScreenOptions,
) {
  const view = renderScreen(`/settings/${tab}`, options)
  await within(main()).findByRole('heading', { level: 2, name: heading })
  return view
}
