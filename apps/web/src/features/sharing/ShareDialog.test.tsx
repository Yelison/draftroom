import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AppProviders } from '../../app/AppProviders.tsx'
import { DataSourceContext } from '../../data/DataSourceContext.ts'
import { createMockServer } from '../../data/mock/createMockDataSource.ts'
import { marta } from '../../data/mock/fixtures/index.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { ShareDialog } from './ShareDialog.tsx'
import { answer, dialog, interviews, launchPlan, openShare, pathOf, renderScreen } from './testing/openShare.tsx'

describe('the share dialog', () => {
  it('lists the people with a role, each with their email and role, and marks the signed-in person', async () => {
    const { share } = await openShare()

    const list = within(share).getByRole('list')
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('Marta Ruiz (you)'),
      expect.stringContaining('Daniel Okafor'),
      expect.stringContaining('Sofía Lindqvist'),
    ])
    expect(within(share).getByRole('combobox', { name: 'Role of Daniel Okafor' })).toHaveValue('editor')
    expect(within(share).getByRole('combobox', { name: 'Role of Sofía Lindqvist' })).toHaveValue('commenter')
    expect(within(share).getByRole('combobox', { name: 'Everyone in the workspace' })).toHaveValue('commenter')
  })

  it('writes its words in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen(pathOf(launchPlan.id))

    const share = await screen.findByRole('dialog', { name: 'Compartir «Autumn launch plan»' })
    expect(await within(share).findByRole('heading', { name: 'Personas con acceso' })).toBeInTheDocument()
    expect(within(share).getByRole('combobox', { name: 'Rol de Daniel Okafor' })).toHaveDisplayValue('Editor')
    expect(within(share).getByRole('combobox', { name: 'Todas las personas del espacio' })).toHaveDisplayValue(
      'Pueden comentar',
    )
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
