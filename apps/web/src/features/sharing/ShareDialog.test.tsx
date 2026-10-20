import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AppProviders } from '../../app/AppProviders.tsx'
import type { DataSource } from '../../data/DataSource.ts'
import { DataSourceContext } from '../../data/DataSourceContext.ts'
import { createMockServer } from '../../data/mock/createMockDataSource.ts'
import { marta } from '../../data/mock/fixtures/index.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { ShareDialog } from './ShareDialog.tsx'
import {
  answer,
  dialog,
  generalAccessOf,
  interviews,
  launchPlan,
  openShare,
  pathOf,
  renderScreen,
  rows,
} from './testing/openShare.tsx'

describe('the share dialog', () => {
  it('lists the people with a role, each with their email and role, and marks the signed-in person', async () => {
    const { share } = await openShare()

    expect(rows(share).map((item) => item.textContent)).toEqual([
      expect.stringContaining('Marta Ruiz (you)'),
      expect.stringContaining('Daniel Okafor'),
      expect.stringContaining('Sofía Lindqvist'),
      expect.stringContaining('Everyone in Harbor Pine'),
    ])
    expect(within(share).getByRole('combobox', { name: 'Role of Daniel Okafor' })).toHaveValue('editor')
    expect(within(share).getByRole('combobox', { name: 'Role of Sofía Lindqvist' })).toHaveValue('commenter')
    expect(generalAccessOf(share)).toHaveValue('commenter')
  })

  it('puts everyone in the workspace in the same list, as its last row, and offers the four ways to open the document', async () => {
    const { share } = await openShare()

    const everyone = rows(share).at(-1)
    expect(everyone).toHaveTextContent('General access')
    expect(
      within(generalAccessOf(share))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Only the people above', 'Can view', 'Can comment', 'Can edit'])
    expect(within(share).queryByRole('heading', { name: 'General access' })).not.toBeInTheDocument()
  })

  it('has the row that adds people before the list, with Viewer as the role to begin with', async () => {
    const { share } = await openShare({ documentId: interviews.id })

    const headings = within(share)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
    expect(headings).toEqual(['Add people', 'People with access'])
    expect(within(share).getByRole('combobox', { name: /^Role$/ })).toHaveValue('viewer')
  })

  it('writes its words in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen(pathOf(launchPlan.id))

    const share = await screen.findByRole('dialog', { name: 'Compartir «Autumn launch plan»' })
    expect(await within(share).findByRole('heading', { name: 'Personas con acceso' })).toBeInTheDocument()
    expect(within(share).getByRole('combobox', { name: 'Rol de Daniel Okafor' })).toHaveDisplayValue('Editor')
    expect(
      within(share).getByRole('combobox', { name: 'Acceso de todas las personas de Harbor Pine' }),
    ).toHaveDisplayValue('Pueden comentar')
    expect(within(share).getByText('Todas las personas de Harbor Pine')).toBeInTheDocument()
    expect(within(share).getByRole('button', { name: 'Quitar a Daniel Okafor' })).toBeInTheDocument()
  })

  it('shows rows with a spoken status while who has access is on its way', async () => {
    renderScreen(pathOf(launchPlan.id), {
      wrap: (dataSource) => ({ ...dataSource, listAccess: () => new Promise(() => undefined) }),
    })

    const share = await dialog()
    expect(await within(share).findByText('Loading who has access')).toHaveAttribute('role', 'status')
    expect(within(share).queryByRole('list')).not.toBeInTheDocument()
  })

  it('says it could not load who has access, and tries again when asked', async () => {
    let failures = 1
    const { user } = renderScreen(pathOf(launchPlan.id), {
      wrap: (dataSource) => ({
        ...dataSource,
        listAccess: (request) => {
          if (failures-- > 0) return Promise.reject(answer(503, 'unavailable'))
          return dataSource.listAccess(request)
        },
      }),
    })

    const share = await dialog()
    expect(await within(share).findByRole('alert')).toHaveTextContent("We couldn't load who has access")
    await user.click(within(share).getByRole('button', { name: 'Try again' }))

    expect(await within(share).findByRole('list')).toBeInTheDocument()
  })

  it('tells someone who is not an owner that only owners can change who has access, without asking for the list', async () => {
    const listAccess = vi.fn()
    renderScreen(pathOf(launchPlan.id), {
      signedInAs: 'daniel@harborpine.example',
      wrap: (dataSource) => ({ ...dataSource, listAccess }),
    })

    const share = await dialog()

    expect(await within(share).findByText('Only owners can change who has access')).toBeInTheDocument()
    expect(listAccess).not.toHaveBeenCalled()
    expect(within(share).queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('says the same when the server refuses the list to someone the screen took for an owner', async () => {
    renderScreen(pathOf(launchPlan.id), {
      wrap: (dataSource) => ({ ...dataSource, listAccess: () => Promise.reject(answer(403, 'forbidden')) }),
    })

    const share = await dialog()

    expect(await within(share).findByText('Only owners can change who has access')).toBeInTheDocument()
  })
})

/** The same list with more people in it than the fixtures have, each with a role of viewer. */
const withGuests =
  (count: number) =>
  (dataSource: DataSource): DataSource => ({
    ...dataSource,
    listAccess: async (request) => {
      const list = await dataSource.listAccess(request)
      const guests = Array.from({ length: count }, (_, index) => ({
        userId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        email: `guest${index + 1}@harborpine.example`,
        name: `Guest ${index + 1}`,
        role: 'viewer' as const,
        createdAt: '2026-10-13T15:30:00Z',
      }))
      return { ...list, items: [...list.items, ...guests] }
    },
  })

describe('the states of the share dialog', () => {
  it('lists one person alone with the row of everyone in the workspace after them, and holds the controls of that owner', async () => {
    const { share } = await openShare({
      wrap: (dataSource) => ({
        ...dataSource,
        listAccess: async (request) => {
          const list = await dataSource.listAccess(request)
          return { ...list, items: list.items.slice(0, 1) }
        },
      }),
    })

    expect(rows(share).map((item) => item.textContent)).toEqual([
      expect.stringContaining('Marta Ruiz (you)'),
      expect.stringContaining('Everyone in Harbor Pine'),
    ])
    expect(within(share).getByRole('combobox', { name: 'Role of Marta Ruiz' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('keeps the row that adds people, the list with everyone in the workspace last, and Done, in that order, with many people', async () => {
    const { share } = await openShare({ documentId: interviews.id, wrap: withGuests(15) })

    const added = within(share).getByRole('combobox', { name: 'Person' })
    const list = within(share).getByRole('list')
    const done = within(share).getByRole('button', { name: 'Done' })
    expect(rows(share)).toHaveLength(18)
    expect(rows(share).at(-1)).toHaveTextContent('Everyone in Harbor Pine')
    expect(added.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(list.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(list.contains(done)).toBe(false)
  })

  it('has a list that stands in for the one on its way, without a list or controls to read yet', async () => {
    renderScreen(pathOf(launchPlan.id), {
      wrap: (dataSource) => ({ ...dataSource, listAccess: () => new Promise(() => undefined) }),
    })

    const share = await dialog()

    await within(share).findByText('Loading who has access')
    expect(share.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(within(share).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(share).queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
  })
})

describe('adding someone to the share dialog', () => {
  it('offers the active people of the workspace who have no role yet, and nobody who is only invited', async () => {
    const { share } = await openShare({ documentId: interviews.id })

    const picker = within(share).getByRole('combobox', { name: 'Person' })
    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Choose someone from the workspace', 'Daniel Okafor'])
  })

  it('says that everyone already has a role when nobody is left to add', async () => {
    const { share } = await openShare()

    expect(within(share).getByText('Everyone in the workspace already has a role.')).toBeInTheDocument()
    expect(within(share).queryByRole('combobox', { name: 'Person' })).not.toBeInTheDocument()
  })

  it('does nothing until someone is chosen', async () => {
    const setAccess = vi.fn()
    const { user, share } = await openShare({
      documentId: interviews.id,
      wrap: (dataSource) => ({ ...dataSource, setAccess }),
    })

    await user.click(within(share).getByRole('button', { name: 'Add' }))

    expect(setAccess).not.toHaveBeenCalled()
  })
})

describe('the close of the share dialog', () => {
  it('leaves the route for the editor and takes the dialog away', async () => {
    const { user, router, share } = await openShare()

    await user.click(within(share).getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/documents/${launchPlan.id}`))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('the title of the share dialog', () => {
  it('does not name an empty document while the document is on its way', async () => {
    const router = createMemoryRouter([{ path: '/documents/:documentId/share', element: <ShareDialog /> }], {
      initialEntries: [pathOf(launchPlan.id)],
    })
    const dataSource = createMockServer().connect({ signedInAs: marta.email })
    render(
      <DataSourceContext value={{ ...dataSource, getDocument: () => new Promise(() => undefined) }}>
        <AppProviders>
          <RouterProvider router={router} />
        </AppProviders>
      </DataSourceContext>,
    )

    expect(await screen.findByRole('dialog', { name: 'Share' })).toBeInTheDocument()
  })
})
