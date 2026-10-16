import { screen } from '@testing-library/react'
import type { DataSource } from '../../../data/DataSource.ts'
import { ApiError } from '../../../data/errors.ts'
import * as fixtures from '../../../data/mock/fixtures/documents.ts'
import { daniel, marta } from '../../../data/mock/fixtures/index.ts'
import { renderScreen } from '../../documents/testing/renderScreen.tsx'

export { daniel, fixtures, marta, renderScreen }

export const main = () => screen.getByRole('main')

const escaped = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The accessible name of the row of an event: its sentence, which the time of day follows. */
export const sentenceOf = (text: string) => new RegExp(`^${escaped(text)}`)

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
