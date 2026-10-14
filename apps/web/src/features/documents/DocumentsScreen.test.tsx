import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../data/errors.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { archivedNotice } from './archivedNotice.ts'
import { fixtures, renderScreen } from './testing/renderScreen.tsx'

const heading = () => screen.findByRole('heading', { level: 1, name: 'Documents' })
const main = () => screen.getByRole('main')
const searchbox = () => within(main()).getByRole('searchbox', { name: 'Search documents' })
/** What the live regions of the work area say now: the notice of an archive is always there, empty until it has something. */
const spoken = () =>
  within(main())
    .getAllByRole('status')
    .map((region) => region.textContent)
const unavailable = () => new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })

describe('the Documents screen', () => {
  it('shows the folders and the documents of the workspace', async () => {
    renderScreen('/documents')
    await heading()

    const folders = await screen.findByRole('region', { name: 'Folders' })
    const links = await within(folders).findAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Ideas', 'Operaciones', 'Product', 'Research'])
    const documents = screen.getByRole('region', { name: 'Documents' })
    expect(await within(documents).findByRole('link', { name: 'Autumn launch plan' })).toHaveAttribute(
      'href',
      `/documents/${fixtures.launchPlan.id}`,
    )
  })

  it('does not list an archived document', async () => {
    renderScreen('/documents')
    await heading()

    await screen.findByRole('link', { name: 'Autumn launch plan' })
    expect(screen.queryByRole('link', { name: 'Old pricing draft' })).not.toBeInTheDocument()
  })

  it('shows cards of the height of the real ones, with a spoken status, while it loads', async () => {
    let arrive: (() => void) | undefined
    renderScreen('/documents', {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: (request) =>
          new Promise((resolve) => (arrive = () => resolve(dataSource.listDocuments(request)))),
      }),
    })
    await heading()

    expect(await within(main()).findByRole('status')).toHaveTextContent('Loading documents')
    expect(within(main()).queryByRole('link', { name: 'Autumn launch plan' })).not.toBeInTheDocument()

    // The call may not have been made yet: the workspace is read first.
    await waitFor(() => expect(arrive).toBeDefined())
    await act(async () => arrive?.())
    expect(await within(main()).findByRole('link', { name: 'Autumn launch plan' })).toBeInTheDocument()
  })

  it('keeps the headline, and the focus on it, from the loading state to the list', async () => {
    const { router } = renderScreen('/shared')
    await screen.findByRole('heading', { level: 1, name: 'Shared' })

    await act(() => router.navigate('/documents'))

    const title = await heading()
    expect(title).toHaveFocus()
    await screen.findByRole('link', { name: 'Autumn launch plan' })
    expect(title).toHaveFocus()
  })

  it('invites the person to create the first document when the workspace has none', async () => {
    renderScreen('/documents', {
      wrap: (dataSource) => ({
        ...dataSource,
        listFolders: async () => ({ items: [] }),
        listDocuments: async () => ({ items: [], nextCursor: null }),
      }),
    })
    await heading()

    expect(await screen.findByText('No documents yet')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Folders' })).not.toBeInTheDocument()
    expect(within(main()).getAllByRole('button', { name: 'New document' })).toHaveLength(2)
  })

  it('says it could not load, and loads again when asked to', async () => {
    let fail = true
    const { user } = renderScreen('/documents', {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: async (request) => {
          if (fail) throw unavailable()
          return dataSource.listDocuments(request)
        },
      }),
    })
    await heading()

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load your documents")

    fail = false
    await user.click(within(main()).getByRole('button', { name: 'Try again' }))

    expect(await within(main()).findByRole('link', { name: 'Autumn launch plan' })).toBeInTheDocument()
  })

  it('says it could not load the workspace, and loads again when asked to', async () => {
    let fail = true
    const { user } = renderScreen('/documents', {
      wrap: (dataSource) => ({
        ...dataSource,
        listWorkspaces: async () => {
          if (fail) throw unavailable()
          return dataSource.listWorkspaces()
        },
      }),
    })
    await heading()

    await within(main()).findByRole('alert')
    fail = false
    await user.click(within(main()).getByRole('button', { name: 'Try again' }))

    expect(await within(main()).findByRole('link', { name: 'Autumn launch plan' })).toBeInTheDocument()
  })
})

describe('searching the Documents screen', () => {
  it('lists only the documents that match, without the folders, and says how many', async () => {
    const { user } = renderScreen('/documents')
    await heading()
    await screen.findByRole('link', { name: 'Autumn launch plan' })

    await user.type(searchbox(), 'weekly')

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Folders' })).not.toBeInTheDocument())
    expect(
      within(screen.getByRole('region', { name: 'Documents' }))
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Weekly update — October 6'])
    await waitFor(() => expect(spoken()).toContain('1 result'))
  })

  it('says so when nothing matches, and keeps the search for the person to change', async () => {
    const { user } = renderScreen('/documents')
    await heading()
    await screen.findByRole('link', { name: 'Autumn launch plan' })

    await user.type(searchbox(), 'zzzz')

    expect(await screen.findByText('No results for “zzzz”')).toBeInTheDocument()
    expect(searchbox()).toHaveValue('zzzz')
  })

  it('sends the search without the spaces around it, and never an empty one', async () => {
    const queries: unknown[] = []
    const { user } = renderScreen('/documents', {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: (request) => {
          queries.push(request?.params.query?.query)
          return dataSource.listDocuments(request)
        },
      }),
    })
    await heading()
    await screen.findByRole('link', { name: 'Autumn launch plan' })

    await user.type(searchbox(), '  weekly  ')
    await waitFor(() => expect(queries).toContain('weekly'))
    await user.clear(searchbox())
    await user.type(searchbox(), '   ')

    expect(queries).not.toContain('  weekly  ')
    expect(queries).not.toContain('')
  })
})

describe('the pages of the Documents screen', () => {
  const smallPages = (dataSource: Parameters<NonNullable<Parameters<typeof renderScreen>[1]>['wrap'] & object>[0]) => ({
    ...dataSource,
    listDocuments: (request: Parameters<typeof dataSource.listDocuments>[0]) =>
      dataSource.listDocuments({
        ...request,
        params: {
          path: { workspaceId: request?.params.path.workspaceId ?? '' },
          query: { ...request?.params.query, limit: 4 },
        },
      }),
  })

  it('loads the next page when asked, and moves the focus to the first document that arrived', async () => {
    const { user } = renderScreen('/documents', { wrap: smallPages })
    await heading()
    const documents = await screen.findByRole('region', { name: 'Documents' })
    expect(await within(documents).findAllByRole('link')).toHaveLength(4)

    await user.click(within(documents).getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(within(documents).getAllByRole('link').length).toBeGreaterThan(4))
    await waitFor(() => expect(within(documents).getAllByRole('link')[4]).toHaveFocus())
  })

  it('stops offering more once the last page is in', async () => {
    const { user } = renderScreen('/documents', { wrap: smallPages })
    await heading()
    const documents = await screen.findByRole('region', { name: 'Documents' })

    // Ten documents in pages of four: two clicks reach the end.
    await user.click(await within(documents).findByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(within(documents).getAllByRole('link')).toHaveLength(8))
    await user.click(within(documents).getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(within(documents).getAllByRole('link')).toHaveLength(10))
    expect(within(documents).queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    expect(document.body).not.toHaveFocus()
  })
})

describe('what the Documents screen says when a document was archived', () => {
  it('announces it, in a live region that was already in the page', async () => {
    const { router } = renderScreen('/shared')
    await screen.findByRole('heading', { level: 1, name: 'Shared' })

    await act(() => router.navigate('/documents', { state: archivedNotice('Autumn launch plan') }))

    await waitFor(() =>
      expect(within(main()).getByRole('status')).toHaveTextContent('“Autumn launch plan” was archived.'),
    )
  })

  it('says nothing when the person simply comes to the screen', async () => {
    renderScreen('/documents')
    await screen.findByRole('link', { name: 'Autumn launch plan' })

    expect(within(main()).getByRole('status')).toBeEmptyDOMElement()
  })
})

describe('the Documents screen in Spanish', () => {
  it('is written in Spanish, dates and counts included', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    const { user } = renderScreen('/documents')

    expect(await screen.findByRole('heading', { level: 1, name: 'Documentos' })).toBeInTheDocument()
    expect(await screen.findByText('Actualizado el 13 oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nuevo documento' })).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Buscar documentos' }), 'semanal')
    await waitFor(() => expect(spoken()).toContain('1 resultado'))
  })
})
