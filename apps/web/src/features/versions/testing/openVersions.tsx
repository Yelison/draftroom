import { screen, within } from '@testing-library/react'
import type { Schema } from '@draftroom/contract'
import type { DataSource } from '../../../data/DataSource.ts'
import { ApiError } from '../../../data/errors.ts'
import { versions } from '../../../data/mock/fixtures/collaboration.ts'
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

/** When a version was made, the way the screen says it in English; the machine's time zone is the screen's too. */
export const when = (isoDate: string) =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoDate))
export const day = (isoDate: string) =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(isoDate))

const escaped = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
const [oldest, named, newest] = versions.filter((version) => version.documentId === launchPlan.id)
if (oldest === undefined || named === undefined || newest === undefined)
  throw new Error('The launch plan has three versions')

/** The three versions of the launch plan, as the fixtures hold them. */
export const launchPlanVersions = { newest, named, oldest }

/** The name of the button that opens each one, from its row. */
export const rowButton = {
  newest: new RegExp(`^Automatic version.*${escaped(day(newest.createdAt))}`),
  named: /^Before the pricing review/,
  oldest: new RegExp(`^Automatic version.*${escaped(day(oldest.createdAt))}`),
}

export const unavailable = () =>
  new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })

export const conflict = () => new ApiError({ type: 'about:blank', title: 'Conflict', status: 409, code: 'conflict' })

/** The data source with some of its operations replaced, for a test to make a call fail, wait or be watched. */
export const replacing =
  (replacements: Partial<DataSource>) =>
  (dataSource: DataSource): DataSource => ({ ...dataSource, ...replacements })

export type Version = Schema<'Version'>
