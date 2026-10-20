import { configure, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import type { Schema } from '@draftroom/contract'
import type { DataSource } from '../../../data/DataSource.ts'
import { ApiError } from '../../../data/errors.ts'
import * as fixtures from '../../../data/mock/fixtures/documents.ts'
import { renderScreen } from '../../documents/testing/renderScreen.tsx'
import '../../editor/testing/jsdomShims.ts'

// The screen is a lazy route and the editor mounts Tiptap in StrictMode: the first test of a file waits for Vitest to load it.
vi.setConfig({ testTimeout: 20_000 })
configure({ asyncUtilTimeout: 10_000 })

export { fixtures, renderScreen }

export const { launchPlan, interviews } = fixtures

export const pathOf = (documentId: string) => `/documents/${documentId}/share`

export const answer = (status: number, code: ApiError['code']) =>
  new ApiError({ type: 'about:blank', title: 'Refused', status, code })

export interface OpenShareOptions {
  documentId?: string
  signedInAs?: string
  wrap?: (dataSource: DataSource) => DataSource
}

/** The dialog, once the document is behind it. */
export const dialog = () => screen.findByRole('dialog', { name: /^Share “/ })

/** Opens the share route as a deep link and waits until the people are listed. */
export async function openShare({ documentId = launchPlan.id, signedInAs, wrap }: OpenShareOptions = {}) {
  const view = renderScreen(pathOf(documentId), {
    ...(signedInAs === undefined ? {} : { signedInAs }),
    ...(wrap === undefined ? {} : { wrap }),
  })
  const share = await dialog()
  await within(share).findByRole('heading', { name: 'People with access' })
  await within(share).findByRole('list')
  return { ...view, share }
}

/** The select that sets the role of one person. */
export const roleOf = (share: HTMLElement, name: string) =>
  within(share).getByRole('combobox', { name: `Role of ${name}` })

/** The select that sets how the whole workspace can open the document: the last row of the list. */
export const generalAccessOf = (share: HTMLElement) =>
  within(share).getByRole('combobox', { name: 'Access for everyone in Harbor Pine' })

/** The rows of the list, in order: the people, and last, everyone in the workspace. */
export const rows = (share: HTMLElement) => within(within(share).getByRole('list')).getAllByRole('listitem')

/** The people in the list, in order, without the row of everyone in the workspace. */
export const people = (share: HTMLElement) => rows(share).slice(0, -1)

export type Role = Schema<'DocumentRole'>
