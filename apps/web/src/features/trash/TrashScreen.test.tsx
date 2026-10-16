import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { answer, archived, main, renderScreen } from './testing/openTrash.tsx'
import type { DataSource } from '../../data/DataSource.ts'

const heading = () => screen.findByRole('heading', { level: 1, name: 'Trash' })

describe('the Trash screen', () => {
  it('lists the archived documents of the workspace with the day each was archived, and none that is live', async () => {
    renderScreen('/trash')
    await heading()
    await within(main()).findByText(archived.first.title)

    const rows = within(main()).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining(`${archived.first.title}Archived Sep 19, 2026`),
      expect.stringContaining(`${archived.second.title}Archived Sep 18, 2026`),
    ])
    expect(within(main()).queryByText('Autumn launch plan')).not.toBeInTheDocument()
  })

  it('does not offer to open an archived document: only its owner can read it, and only to restore or delete it', async () => {
    renderScreen('/trash')

    await within(main()).findByText(archived.first.title)
    expect(within(main()).queryByRole('link')).not.toBeInTheDocument()
  })

  it('writes the dates and the words in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/trash')

    expect(await screen.findByRole('heading', { level: 1, name: 'Papelera' })).toBeInTheDocument()
    expect(await within(main()).findByText('Archivado el 18 sept 2026')).toBeInTheDocument()
    expect(within(main()).getByRole('button', { name: 'Restaurar «Old pricing draft»' })).toBeInTheDocument()
    expect(
      within(main()).getByRole('button', { name: 'Eliminar «Old pricing draft» para siempre' }),
    ).toBeInTheDocument()
  })

  it('shows a skeleton with a spoken status while the documents are on their way, under the headline the page already has', async () => {
    renderScreen('/trash', {
      wrap: (dataSource) => ({ ...dataSource, listDocuments: () => new Promise(() => undefined) }),
    })

    await heading()
    expect(await within(main()).findByText('Loading the trash')).toHaveAttribute('role', 'status')
    expect(within(main()).queryByRole('button')).not.toBeInTheDocument()
  })

  it('says the trash is empty when nothing is archived', async () => {
    renderScreen('/trash', {
      wrap: (dataSource) => ({ ...dataSource, listDocuments: async () => ({ items: [], nextCursor: null }) }),
    })

    expect(await within(main()).findByText('The trash is empty')).toBeInTheDocument()
    expect(within(main()).getByText('Documents you archive will appear here.')).toBeInTheDocument()
    expect(within(main()).queryByRole('list')).not.toBeInTheDocument()
  })

  it('says it could not read the documents, and tries again when asked', async () => {
    let failures = 1
    const { user } = renderScreen('/trash', {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: (request) => {
          if (failures-- > 0) return Promise.reject(answer(503, 'unavailable'))
          return dataSource.listDocuments(request)
        },
      }),
    })

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load your documents")
    await user.click(within(main()).getByRole('button', { name: 'Try again' }))

    expect(await within(main()).findByText(archived.second.title)).toBeInTheDocument()
    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('tells a person who belongs to no workspace so, instead of a trash that would be empty for the wrong reason', async () => {
    renderScreen('/trash', {
      wrap: (dataSource) => ({ ...dataSource, listWorkspaces: async () => ({ items: [] }) }),
    })

    expect(await screen.findByText("You're not in a workspace yet")).toBeInTheDocument()
  })
})

describe('the way to the Trash', () => {
  it('is a link in the toolbar of Documents, and Documents stays the current section there', async () => {
    const { user, router } = renderScreen('/documents')

    await user.click(await screen.findByRole('link', { name: 'Trash' }))

    await heading()
    expect(router.state.location.pathname).toBe('/trash')
    expect(screen.getAllByRole('link', { current: 'page' }).map((link) => link.textContent)).toEqual(['Documents'])
  })
})

describe('the pages of the Trash screen', () => {
  const onePerPage = (dataSource: DataSource): DataSource => ({
    ...dataSource,
    listDocuments: (request) =>
      dataSource.listDocuments({
        params: {
          path: { workspaceId: request?.params.path.workspaceId ?? '' },
          query: { ...request?.params.query, limit: 1 },
        },
      }),
  })

  it('loads the next page when asked, and moves the focus to the first document that arrived', async () => {
    const { user } = renderScreen('/trash', { wrap: onePerPage })
    await within(main()).findByText(archived.first.title)
    expect(within(main()).getAllByRole('listitem')).toHaveLength(1)

    await user.click(within(main()).getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(within(main()).getAllByRole('listitem')).toHaveLength(2))
    await waitFor(() =>
      expect(within(main()).getByRole('button', { name: `Restore “${archived.second.title}”` })).toHaveFocus(),
    )
  })

  it('stops offering more once the last page is in', async () => {
    const { user } = renderScreen('/trash', { wrap: onePerPage })

    await user.click(await within(main()).findByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(within(main()).getAllByRole('listitem')).toHaveLength(2))
    expect(within(main()).queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    expect(document.body).not.toHaveFocus()
  })
})
