import { screen, waitFor, within } from '@testing-library/react'
import type { DataSource } from '../../../data/DataSource.ts'
import { ApiError } from '../../../data/errors.ts'
import * as fixtures from '../../../data/mock/fixtures/documents.ts'
import { daniel, marta } from '../../../data/mock/fixtures/index.ts'
import { renderScreen } from '../../documents/testing/renderScreen.tsx'
import type { ActivityEvent } from '../activityEvents.ts'

export { daniel, fixtures, marta, renderScreen }

export const main = () => screen.getByRole('main')

/** The rows of the timeline, one for each event or burst; what a row says is what its text holds. */
export const rows = () =>
  within(main())
    .getAllByRole('listitem')
    .filter((item) => item.hasAttribute('data-entry'))

/** The row that says `sentence`, once it is there. */
export const findRow = (sentence: string) =>
  waitFor(() => {
    const row = rows().find((candidate) => candidate.textContent?.includes(sentence))
    if (row === undefined) throw new Error(`No row says “${sentence}”`)
    return row
  })

/** What the history shows of the seed, newest first: the first four sentences, for a person who can read everything. */
export const newestSentences = [
  'Marta Ruiz renamed “Autumn launch plan”',
  'Marta Ruiz commented on “Notas de la revisión de diseño”',
  'Marta Ruiz replied to a comment on “Autumn launch plan”',
  'Sofía Lindqvist commented on “Autumn launch plan”',
] as const

export const unavailable = () =>
  new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })

export type Calls = Parameters<DataSource['listWorkspaceActivity']>[0][]

/** Wraps the data source so that the requests for the history are kept, in order, for a test to read. */
export function watchingHistory(calls: Calls) {
  return (dataSource: DataSource): DataSource => ({
    ...dataSource,
    listWorkspaceActivity: (request) => {
      if (request !== undefined) calls.push(request)
      return dataSource.listWorkspaceActivity(request)
    },
  })
}

/** The history, with each page limited to `size` events, so that "Load more" is there as soon as the first row is. */
export const inPagesOf =
  (size: number, calls: Calls = []) =>
  (dataSource: DataSource): DataSource =>
    watchingHistory(calls)({
      ...dataSource,
      listWorkspaceActivity: (request) =>
        dataSource.listWorkspaceActivity(
          request === undefined
            ? request
            : { ...request, params: { ...request.params, query: { ...request.params.query, limit: size } } },
        ),
    })

/**
 * The history as these pages, in order, whatever the filters: the cursor of a page is the number of the next one. A page
 * the test says to `fail` is refused each time it is asked for, so that a test can then let it through.
 */
export const withPages =
  (pages: readonly ActivityEvent[][], fail: (page: number) => boolean = () => false) =>
  (dataSource: DataSource): DataSource => ({
    ...dataSource,
    listWorkspaceActivity: async (request) => {
      const page = Number(request?.params.query?.cursor ?? 0)
      if (fail(page)) throw unavailable()
      return { items: pages[page] ?? [], nextCursor: page + 1 < pages.length ? String(page + 1) : null }
    },
  })
