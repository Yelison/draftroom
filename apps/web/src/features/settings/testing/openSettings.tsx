import { screen, waitFor, within } from '@testing-library/react'
import { expect } from 'vitest'
import { ApiError } from '../../../data/errors.ts'
import { renderScreen, type RenderScreenOptions } from '../../documents/testing/renderScreen.tsx'

export { renderScreen }

/** The dialog of Settings, which is open whenever the address has `?settings=`. */
export const dialog = (name = 'Settings') => screen.getByRole('dialog', { name })

/** A refusal the way the server gives it: the status and the stable code, with nothing that is meant for people. */
export const refusal = (status: number, code: ApiError['code']) =>
  new ApiError({ type: 'about:blank', title: 'Refused', status, code })

/** Opens Settings over Home and waits until it has what it came for: the sections, filled in and no longer busy. */
export async function openSettings(options?: RenderScreenOptions & { path?: string }) {
  const view = renderScreen(options?.path ?? '/?settings=profile', options)
  const open = await screen.findByRole('dialog', { name: 'Settings' })
  await waitFor(() => expect(open.querySelector('form')).not.toBeNull())
  await waitFor(() => expect(open.querySelector('form[aria-busy]')).toBeNull())
  return view
}
