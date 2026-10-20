import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { fixtures, renderScreen, workspaceFixtures } from '../documents/testing/renderScreen.tsx'
import { failingOnce, main, never, overriding, renderHome } from './testing/homeData.ts'

describe('the headline of Home', () => {
  it('names the workspace under the title', async () => {
    renderScreen('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
    expect(await within(main()).findByText(workspaceFixtures.harborPine.name)).toBeInTheDocument()
  })

  it('goes on without the name when the workspace cannot be read', async () => {
    await renderHome({ wrap: overriding({ getWorkspace: () => Promise.reject(new Error('offline')) }) })
    await within(main()).findAllByRole('link', { name: fixtures.launchPlan.title })

    expect(within(main()).queryByText(workspaceFixtures.harborPine.name)).not.toBeInTheDocument()
    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('writes the words in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument()
    expect(await within(main()).findByRole('region', { name: 'Empieza algo nuevo' })).toBeInTheDocument()
    expect(await within(main()).findByRole('region', { name: 'Retoma donde lo dejaste' })).toBeInTheDocument()
    expect(within(main()).getByRole('button', { name: 'Nuevo documento' })).toBeVisible()
  })
})

describe('what Home shows while it loads and when there is nothing yet', () => {
  it('shows the sections that are on their way as skeletons with a spoken status', async () => {
    await renderHome({ wrap: overriding({ listDocuments: never, listTemplates: never }) })

    expect(await within(main()).findByText('Loading your recent documents')).toHaveAttribute('role', 'status')
    expect(await within(main()).findByText('Loading templates')).toHaveAttribute('role', 'status')
  })

  it('draws the pinned documents and the latest event only once the documents above them have arrived', async () => {
    await renderHome({ wrap: overriding({ listDocuments: never }) })
    await within(main()).findByText('Loading your recent documents')

    expect(within(main()).queryByRole('region', { name: 'Pinned' })).not.toBeInTheDocument()
    expect(within(main()).queryByRole('link', { name: 'See all activity' })).not.toBeInTheDocument()
  })

  it('leaves only the way to start for an account with no documents, nothing pinned and nothing that happened', async () => {
    renderScreen('/', {
      wrap: overriding({
        listDocuments: async () => ({ items: [], nextCursor: null }),
        listPinnedDocuments: async () => ({ items: [] }),
        listWorkspaceActivity: async () => ({ items: [], nextCursor: null }),
      }),
    })

    expect(await within(main()).findByText(/documents you create/i)).toBeInTheDocument()
    await waitFor(() => expect(within(main()).queryByText('Loading your pinned documents')).not.toBeInTheDocument())
    expect(within(main()).getByRole('region', { name: 'Start something new' })).toBeInTheDocument()
    expect(within(main()).queryByRole('region', { name: 'Pinned' })).not.toBeInTheDocument()
    expect(within(main()).queryByRole('link', { name: 'See all activity' })).not.toBeInTheDocument()
    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not let a section that failed take the others down', async () => {
    await renderHome({ wrap: failingOnce('listPinnedDocuments') })

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load your pinned documents")
    expect(within(main()).getByRole('region', { name: 'Start something new' })).toBeInTheDocument()
    expect(within(main()).getByRole('region', { name: 'Pick up where you left off' })).toBeInTheDocument()
    expect(await within(main()).findByRole('link', { name: 'See all activity' })).toBeInTheDocument()
  })
})
