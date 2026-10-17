import { screen, within } from '@testing-library/react'
import type { Schema } from '@draftroom/contract'
import type { DataSource } from '../../../data/DataSource.ts'
import { ApiError } from '../../../data/errors.ts'
import { launchPlan } from '../../../data/mock/fixtures/documents.ts'
import { daniel } from '../../../data/mock/fixtures/index.ts'
import { renderScreen, type RenderScreenOptions } from '../../documents/testing/renderScreen.tsx'
import '../../editor/testing/jsdomShims.ts'

export { daniel, launchPlan, renderScreen }

export const sofia = 'sofia@harborpine.example'
export const versionsPath = (documentId: string) => `/documents/${documentId}/versions`

/** The section of the screen that holds the list: the page has other lists (the rail, the explorer). */
const listSection = () => screen.findByRole('region', { name: 'Versions' })

/** The history of a document, opened on its own address as a person who follows a link does, once its rows are there. */
export async function openVersions(documentId = launchPlan.id, options?: RenderScreenOptions) {
  const view = renderScreen(versionsPath(documentId), options)
  await within(await listSection()).findAllByRole('button')
  return view
}

/** The rows of the list, which are there once the versions are: the skeleton's are not. */
export const rows = () => within(screen.getByRole('region', { name: 'Versions' })).getAllByRole('listitem')

/** Waits for the rows of the list. */
export async function versionRows() {
  await within(await listSection()).findAllByRole('button')
  return rows()
}

/** What each version of the launch plan is called in the fixtures, newest first. */
export const launchPlanVersions = {
  newest: /^Automatic version.*Oct 13, 2026/,
  named: /^Before the pricing review/,
  oldest: /^Automatic version.*Oct 9, 2026/,
} as const

export const unavailable = () =>
  new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })

export const conflict = () => new ApiError({ type: 'about:blank', title: 'Conflict', status: 409, code: 'conflict' })

/** The data source with some of its operations replaced, for a test to make a call fail, wait or be watched. */
export const replacing =
  (replacements: Partial<DataSource>) =>
  (dataSource: DataSource): DataSource => ({ ...dataSource, ...replacements })

export type Version = Schema<'Version'>
