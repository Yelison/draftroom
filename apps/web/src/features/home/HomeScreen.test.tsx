import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../data/errors.ts'
import type { DataSource } from '../../data/DataSource.ts'
import { daniel, marta } from '../../data/mock/fixtures/index.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { fixtures, renderScreen } from '../documents/testing/renderScreen.tsx'

const { launchPlan, interviews } = fixtures
const main = () => screen.getByRole('main')
const unavailable = () => new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })
const never = () => new Promise<never>(() => undefined)
const pinnedSection = () => within(main()).getByRole('region', { name: 'Pinned' })
const activitySection = () => within(main()).findByRole('region', { name: 'Recent activity' })
const unpinButton = (title: string) => within(pinnedSection()).getByRole('button', { name: `Unpin ${title}` })

/** Fails the first call of an operation with a 503 and lets the later ones through. */
const failingOnce =
  <Name extends 'listPinnedDocuments' | 'listWorkspaceActivity'>(name: Name) =>
  (dataSource: DataSource): DataSource => {
    let failures = 1
    return {
      ...dataSource,
      [name]: (request: Parameters<DataSource[Name]>[0]) =>
        failures-- > 0
          ? Promise.reject(unavailable())
          : (dataSource[name] as (request: unknown) => Promise<unknown>)(request),
    }
  }

describe('the pinned documents of the Home screen', () => {
  it('lists the documents the person pinned, most recently changed first, each with its excerpt', async () => {
    renderScreen('/')

    await within(main()).findByRole('link', { name: launchPlan.title })
    const cards = within(pinnedSection()).getAllByRole('listitem')
    expect(cards.map((card) => within(card).getByRole('link').textContent)).toEqual([
      launchPlan.title,
      interviews.title,
    ])
    expect(cards[0]).toHaveTextContent(launchPlan.excerpt ?? '')
    expect(cards[1]).toHaveTextContent(interviews.excerpt ?? '')
  })

  it('opens a document from its title', async () => {
    const { user, router } = renderScreen('/')

    await user.click(await within(main()).findByRole('link', { name: launchPlan.title }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/documents/${launchPlan.id}`))
  })

  it('shows a skeleton with a spoken status while they are on their way, and asks for no activity until they are in', async () => {
    let pinnedRequests = 0
    let activityRequests = 0
    renderScreen('/', {
      wrap: (dataSource) => ({
        ...dataSource,
        listPinnedDocuments: () => {
          pinnedRequests += 1
          return never()
        },
        listWorkspaceActivity: (request) => {
          activityRequests += 1
          return dataSource.listWorkspaceActivity(request)
        },
      }),
    })

    expect(await within(main()).findByText('Loading your pinned documents')).toHaveAttribute('role', 'status')
    // The skeleton of the workspace and the one of the pins read the same: the pins are on their way once they are asked for.
    await waitFor(() => expect(pinnedRequests).toBe(1))
    expect(within(main()).queryByRole('region', { name: 'Recent activity' })).not.toBeInTheDocument()
    expect(activityRequests).toBe(0)
  })

  it('says nothing is pinned, and offers the first document, when the person has no pins', async () => {
    const { user, router } = renderScreen('/', { signedInAs: 'sofia@harborpine.example' })

    expect(await within(main()).findByText('Nothing pinned yet')).toBeInTheDocument()
    await user.click(within(main()).getByRole('button', { name: 'New document' }))

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/documents\/.+/))
  })

  it('says it could not read them, and tries again when asked', async () => {
    const { user } = renderScreen('/', { wrap: failingOnce('listPinnedDocuments') })

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load your pinned documents")
    await user.click(within(main()).getByRole('button', { name: 'Try again' }))

    expect(await within(main()).findByRole('link', { name: launchPlan.title })).toBeInTheDocument()
    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('takes a pin off, announces it, and gives the focus to the card that takes its place', async () => {
    const { user } = renderScreen('/')
    await user.click(await within(main()).findByRole('button', { name: `Unpin ${launchPlan.title}` }))

    await waitFor(() => expect(within(pinnedSection()).queryByRole('link', { name: launchPlan.title })).toBeNull())
    expect(within(main()).getByRole('status', { name: '' })).toHaveTextContent(
      `${launchPlan.title} is no longer pinned`,
    )
    expect(unpinButton(interviews.title)).toHaveFocus()
  })

  it('moves the focus to the button of the empty state when the last pin is taken off', async () => {
    const { user } = renderScreen('/', { signedInAs: daniel.email })
    await user.click(await within(main()).findByRole('button', { name: `Unpin ${launchPlan.title}` }))

    expect(await within(main()).findByText('Nothing pinned yet')).toBeInTheDocument()
    await waitFor(() => expect(within(main()).getByRole('button', { name: 'New document' })).toHaveFocus())
  })

  it('is operated with the keyboard alone', async () => {
    const { user } = renderScreen('/')
    const button = await within(main()).findByRole('button', { name: `Unpin ${launchPlan.title}` })

    button.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(within(pinnedSection()).queryByRole('link', { name: launchPlan.title })).toBeNull())
  })

  it('says why a pin could not be taken off, and keeps the card', async () => {
    const { user } = renderScreen('/', {
      wrap: (dataSource) => ({ ...dataSource, unpinDocument: () => Promise.reject(unavailable()) }),
    })

    await user.click(await within(main()).findByRole('button', { name: `Unpin ${launchPlan.title}` }))

    expect(await within(main()).findByRole('alert')).toHaveTextContent('Draftroom is unavailable right now')
    expect(within(main()).getByRole('link', { name: launchPlan.title })).toBeInTheDocument()
  })

  it('never shows a document the person can no longer read, nor its excerpt', async () => {
    const { server, queryClient } = renderScreen('/', { signedInAs: daniel.email })
    expect(await within(main()).findByText(launchPlan.excerpt ?? '')).toBeInTheDocument()

    await server
      .connect({ signedInAs: marta.email })
      .removeAccess({ params: { path: { documentId: launchPlan.id, userId: daniel.id } } })
    await server
      .connect({ signedInAs: marta.email })
      .setGeneralAccess({ params: { path: { documentId: launchPlan.id } }, body: { generalAccess: 'none' } })
    await queryClient.invalidateQueries()

    // The list is answered, and answers without it: a list that failed would not show it either, and would say so.
    expect(await within(main()).findByText('Nothing pinned yet')).toBeInTheDocument()
    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
    expect(main()).not.toHaveTextContent(launchPlan.excerpt ?? '')
  })

  it('writes the words in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument()
    expect(await within(main()).findByRole('button', { name: `Quitar el fijado de ${launchPlan.title}` })).toBeVisible()
    expect(within(main()).getByRole('region', { name: 'Fijados' })).toBeInTheDocument()
    expect(await within(main()).findByRole('region', { name: 'Actividad reciente' })).toBeInTheDocument()
  })
})

describe('the recent activity of the Home screen', () => {
  it('lists the latest events of the workspace and links to all of them', async () => {
    renderScreen('/')

    const section = await activitySection()
    expect(await within(section).findByText(/renamed “Autumn launch plan”/)).toBeInTheDocument()
    expect(within(section).getAllByRole('listitem').length).toBeLessThanOrEqual(8)
    expect(within(section).getByRole('link', { name: 'See all activity' })).toHaveAttribute('href', '/history')
  })

  it('shows a skeleton with a spoken status while it is on its way', async () => {
    renderScreen('/', { wrap: (dataSource) => ({ ...dataSource, listWorkspaceActivity: never }) })

    expect(await within(main()).findByText('Loading recent activity')).toHaveAttribute('role', 'status')
  })

  it('says nothing has happened yet when there are no events', async () => {
    renderScreen('/', {
      wrap: (dataSource) => ({ ...dataSource, listWorkspaceActivity: async () => ({ items: [], nextCursor: null }) }),
    })

    expect(await within(await activitySection()).findByText('Nothing has happened yet')).toBeInTheDocument()
    expect(within(main()).queryByRole('link', { name: 'See all activity' })).not.toBeInTheDocument()
  })

  it('says it could not read the events, and tries again when asked, without touching the pinned documents', async () => {
    const { user } = renderScreen('/', { wrap: failingOnce('listWorkspaceActivity') })

    const section = await activitySection()
    expect(await within(section).findByRole('alert')).toHaveTextContent("We couldn't load recent activity")
    expect(within(main()).getByRole('link', { name: launchPlan.title })).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: 'Try again' }))

    expect(await within(section).findByRole('link', { name: 'See all activity' })).toBeInTheDocument()
  })
})
