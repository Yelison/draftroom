import { expect } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import type { Schema } from '@draftroom/contract'
import type { DataSource } from '../../../data/DataSource.ts'
import { ApiError } from '../../../data/errors.ts'
import { seedId } from '../../../data/mock/ids.ts'
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

/** The switch that shows the automatic versions, which is the list's own. */
export const automaticToggle = () =>
  within(screen.getByRole('region', { name: 'Versions' })).getByRole('button', { name: 'Show automatic versions' })

/** The history of a document, opened on its own address as a person who follows a link does, once its list is there. */
export async function openVersions(documentId = launchPlan.id, options?: RenderScreenOptions) {
  const view = renderScreen(versionsPath(documentId), options)
  await listSection()
  // The switch is the list's own and is off while it loads, so it being on is the list having arrived.
  await waitFor(() => expect(automaticToggle()).toBeEnabled())
  return view
}

/** The versions of the list, which are there once they are: the skeleton's rows are not. */
export const rows = () => within(screen.getByRole('region', { name: 'Versions' })).getAllByRole('listitem')

/** The button of a row, which chooses the version. */
export const choose = (row: HTMLElement) => within(row).getByRole('button')

/** The text of the version that is read, once it is there. */
export const reading = () => screen.findByRole('region', { name: /^Text of / })

/** When a version was made, the way the screen says it in English; the machine's time zone is the screen's too. */
export const when = (isoDate: string) =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoDate))
export const time = (isoDate: string) =>
  new Intl.DateTimeFormat('en-US', { timeStyle: 'short' }).format(new Date(isoDate))

const [oldest, named, newest] = versions.filter((version) => version.documentId === launchPlan.id)
if (oldest === undefined || named === undefined || newest === undefined)
  throw new Error('The launch plan has three versions')

/** The three versions of the launch plan, as the fixtures hold them. */
export const launchPlanVersions = { newest, named, oldest }

export const unavailable = () =>
  new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })

export const conflict = () => new ApiError({ type: 'about:blank', title: 'Conflict', status: 409, code: 'conflict' })

/** The data source with some of its operations replaced, for a test to make a call fail, wait or be watched. */
export const replacing =
  (replacements: Partial<DataSource>) =>
  (dataSource: DataSource): DataSource => ({ ...dataSource, ...replacements })

export type Version = Schema<'Version'>

/** An id of a version a test makes up, in the shape the contract gives ids and clear of the fixtures'. */
export const versionId = (index: number) => seedId(99, index)

/** A version that meets the contract, for a test to list what the fixtures do not have. */
export const makeVersion = (version: Pick<Version, 'id' | 'createdAt'> & Partial<Version>): Version => ({
  documentId: launchPlan.id,
  kind: 'manual',
  label: null,
  createdBy: null,
  sizeBytes: 1200,
  ...version,
})

/** A data source whose list is the given versions, in one page or, with a cursor, in the first of two. */
export const listing = (items: Version[], nextCursor: string | null = null) =>
  replacing({ listVersions: async () => ({ items, nextCursor }) })
