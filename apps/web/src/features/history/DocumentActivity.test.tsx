import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { renderDocumentActivity } from './testing/renderDocumentActivity.tsx'
import { daniel, fixtures, unavailable } from './testing/openHistory.tsx'

const activity = () => screen.getByRole('region', { name: 'Activity' })
const rows = () => within(activity()).getAllByRole('listitem')

const inPagesOf =
  (size: number) =>
  (dataSource: DataSource): DataSource => ({
    ...dataSource,
    listDocumentActivity: (request) =>
      dataSource.listDocumentActivity(
        request === undefined
          ? request
          : { ...request, params: { ...request.params, query: { ...request.params.query, limit: size } } },
      ),
  })

describe('the activity of a document', () => {
  it('lists what happened to that document and to no other, newest first, under a heading for each day', async () => {
    renderDocumentActivity(fixtures.launchPlan.id)

    await within(activity()).findByText('Marta Ruiz renamed “Autumn launch plan”')

    expect(rows()).toHaveLength(9)
    expect(rows()[0]).toHaveTextContent('Marta Ruiz renamed “Autumn launch plan”')
    expect(within(activity()).queryByText(/Notas de la revisión de diseño/)).not.toBeInTheDocument()
    // A level under the heading of the place that holds the list.
    expect(
      within(activity())
        .getAllByRole('heading')
        .every((heading) => heading.tagName === 'H3'),
    ).toBe(true)
  })

  it('tells an owner who was given access, and tells a person who owns nothing no such thing', async () => {
    const owner = renderDocumentActivity(fixtures.launchPlan.id)
    expect(await within(activity()).findByText(/gave Daniel Okafor access to/)).toBeInTheDocument()
    owner.unmount()

    renderDocumentActivity(fixtures.launchPlan.id, { signedInAs: daniel.email })

    await within(activity()).findByText('Marta Ruiz renamed “Autumn launch plan”')
    expect(within(activity()).queryByText(/access to/)).not.toBeInTheDocument()
  })

  it('writes it in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderDocumentActivity(fixtures.launchPlan.id)

    expect(
      await within(activity()).findByText('Marta Ruiz cambió el nombre de «Autumn launch plan»'),
    ).toBeInTheDocument()
  })

  it('shows a skeleton with a spoken status while the activity is on its way', async () => {
    renderDocumentActivity(fixtures.launchPlan.id, {
      wrap: (dataSource) => ({ ...dataSource, listDocumentActivity: () => new Promise(() => undefined) }),
    })

    expect(await within(activity()).findByText('Loading the activity')).toHaveAttribute('role', 'status')
  })

  it('says there is no activity yet when the document has none', async () => {
    renderDocumentActivity(fixtures.launchPlan.id, {
      wrap: (dataSource) => ({ ...dataSource, listDocumentActivity: async () => ({ items: [], nextCursor: null }) }),
    })

    expect(await within(activity()).findByText('No activity yet')).toBeInTheDocument()
  })

  it('says it could not read the activity, and tries again when asked', async () => {
    let failures = 1
    const { user } = renderDocumentActivity(fixtures.launchPlan.id, {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocumentActivity: (request) => {
          if (failures-- > 0) return Promise.reject(unavailable())
          return dataSource.listDocumentActivity(request)
        },
      }),
    })

    expect(await within(activity()).findByRole('alert')).toHaveTextContent("We couldn't load the activity")
    await user.click(within(activity()).getByRole('button', { name: 'Try again' }))

    expect(await within(activity()).findByText('Marta Ruiz renamed “Autumn launch plan”')).toBeInTheDocument()
  })

  it('goes on with "Load more", and puts the focus on the first event that arrived when the last page is in', async () => {
    const { user } = renderDocumentActivity(fixtures.launchPlan.id, { wrap: inPagesOf(5) })
    await within(activity()).findByText('Marta Ruiz renamed “Autumn launch plan”')
    expect(rows()).toHaveLength(5)

    await user.click(within(activity()).getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(rows()).toHaveLength(9))
    expect(within(activity()).queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    expect(rows()[5]?.querySelector('[tabindex]')).toHaveFocus()
  })
})
