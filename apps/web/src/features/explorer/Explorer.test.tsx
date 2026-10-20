import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { ApiError } from '../../data/errors.ts'
import { fixtures, renderScreen } from '../documents/testing/renderScreen.tsx'

const { launchPlan, interviews, budget } = fixtures
const openPath = `/documents/${launchPlan.id}/share`
const explorer = () => screen.findByRole('complementary', { name: 'Explorer' })
const toggle = async (name: string) => within(await explorer()).findByRole('button', { name })
const link = async (name: string) => within(await explorer()).findByRole('link', { name })

/** The requests for documents that the explorer made, by what they asked for. */
function watchingDocuments(asked: { folderId?: string; unfiled?: boolean }[]) {
  return (dataSource: DataSource): DataSource => ({
    ...dataSource,
    listDocuments: (request) => {
      const { folderId, unfiled } = request.params.query ?? {}
      asked.push({
        ...(folderId === undefined ? {} : { folderId }),
        ...(unfiled === undefined ? {} : { unfiled }),
      })
      return dataSource.listDocuments(request)
    },
  })
}

describe('the explorer beside a document', () => {
  it('is folded but for Pinned', async () => {
    renderScreen(openPath)

    expect(await toggle('Pinned')).toHaveAttribute('aria-expanded', 'true')
    for (const name of ['Ideas', 'Operaciones', 'Product', 'Research', 'No folder']) {
      expect(await toggle(name), name).toHaveAttribute('aria-expanded', 'false')
    }
  })

  it('asks the server for no folder when a document opens: only what is open is asked for', async () => {
    const asked: Parameters<typeof watchingDocuments>[0] = []
    renderScreen(openPath, { wrap: watchingDocuments(asked) })

    await link('Autumn launch plan')

    expect(asked.filter(({ folderId, unfiled }) => folderId !== undefined || unfiled === true)).toEqual([])
  })

  it('marks the open document as the page the person is on, and no other', async () => {
    renderScreen(openPath)

    expect(await link('Autumn launch plan')).toHaveAttribute('aria-current', 'page')
    expect(await link('Customer interview synthesis')).not.toHaveAttribute('aria-current')
  })

  it('moves the mark to the document that is opened, and takes it off the one that was open', async () => {
    const { router } = renderScreen(openPath)
    await link('Autumn launch plan')

    await act(() => router.navigate(`/documents/${interviews.id}/share`))

    await waitFor(async () =>
      expect(await link('Customer interview synthesis')).toHaveAttribute('aria-current', 'page'),
    )
    expect(await link('Autumn launch plan')).not.toHaveAttribute('aria-current')
  })

  it('opens a folder when it is chosen, asks for its documents then, and folds it again', async () => {
    const asked: Parameters<typeof watchingDocuments>[0] = []
    const { user } = renderScreen(openPath, { wrap: watchingDocuments(asked) })
    const folder = await toggle('Operaciones')
    await link('Autumn launch plan')
    const before = asked.length

    await user.click(folder)

    expect(folder).toHaveAttribute('aria-expanded', 'true')
    expect(await link(budget.title)).toBeInTheDocument()
    expect(asked.slice(before)).toEqual([expect.objectContaining({ folderId: fixtures.budget.folderId })])

    await user.click(folder)
    expect(folder).toHaveAttribute('aria-expanded', 'false')
    expect(within(await explorer()).queryByRole('link', { name: budget.title })).not.toBeInTheDocument()
  })

  it('draws each document on a line, with its title and nothing of its excerpt, its author or its date', async () => {
    renderScreen(openPath)

    const row = (await link('Autumn launch plan')).closest('li') as HTMLElement

    expect(row.querySelector('time')).toBeNull()
    expect(within(row).queryByText('Created by')).not.toBeInTheDocument()
    expect(within(row).queryByText(/second week of November/)).not.toBeInTheDocument()
  })

  it('opens a document with a click', async () => {
    const { user, router } = renderScreen(openPath)

    await user.click(await link('Customer interview synthesis'))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/documents/${interviews.id}`))
  })

  it('does not list an archived document', async () => {
    const { user } = renderScreen(openPath)
    await user.click(await toggle('Product'))
    await link('Notas de la revisión de diseño')

    expect(within(await explorer()).queryByRole('link', { name: 'Old pricing draft' })).not.toBeInTheDocument()
  })
})

describe('the search of the explorer', () => {
  it('asks the server for the documents that match, and lists them in place of the sections', async () => {
    const queries: unknown[] = []
    const { user } = renderScreen(openPath, {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: (request) => {
          queries.push(request.params.query?.query)
          return dataSource.listDocuments(request)
        },
      }),
    })
    await link('Autumn launch plan')

    await user.type(screen.getByRole('searchbox', { name: 'Search documents' }), ' brand ')

    expect(await link('Brand voice guide')).toBeInTheDocument()
    expect(within(await explorer()).queryByRole('button', { name: 'Pinned' })).not.toBeInTheDocument()
    expect(queries).toContain('brand')
    expect(queries.at(-1)).not.toBe(' brand ')
  })

  it('says so when nothing matches, does not ask the server for an empty search, and gives the sections back when it is cleared', async () => {
    const queries: unknown[] = []
    const { user } = renderScreen(openPath, {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: (request) => {
          queries.push(request.params.query?.query)
          return dataSource.listDocuments(request)
        },
      }),
    })
    await link('Autumn launch plan')

    await user.type(screen.getByRole('searchbox', { name: 'Search documents' }), 'zzzz')
    expect(await screen.findByText('No results for “zzzz”')).toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: 'Search documents' }))
    expect(await toggle('Pinned')).toBeInTheDocument()
    expect(queries).not.toContain('')
  })
})

describe('the states of the explorer', () => {
  it('shows the sections as they will be, with a spoken status, while it loads', async () => {
    let arrive: (() => void) | undefined
    renderScreen(openPath, {
      wrap: (dataSource) => ({
        ...dataSource,
        listFolders: (request) => new Promise((resolve) => (arrive = () => resolve(dataSource.listFolders(request)))),
      }),
    })

    const column = await explorer()
    // The workspace is read first: only once the folders are asked for is there something to wait for.
    await waitFor(() => expect(arrive).toBeDefined())
    await waitFor(() =>
      expect(
        within(column)
          .getAllByRole('status')
          .map((region) => region.textContent),
      ).toContain('Loading documents'),
    )
    expect(within(column).queryByText('No documents yet')).not.toBeInTheDocument()
    expect(within(column).queryByRole('button', { name: 'Pinned' })).not.toBeInTheDocument()

    await act(async () => arrive?.())
    expect(await toggle('Pinned')).toBeInTheDocument()
  })

  it('keeps the way to a first document when the workspace has no folder and nothing is pinned', async () => {
    renderScreen(openPath, {
      wrap: (dataSource) => ({
        ...dataSource,
        listFolders: async () => ({ items: [] }),
        listPinnedDocuments: async () => ({ items: [] }),
        listDocuments: async () => ({ items: [], nextCursor: null }),
      }),
    })

    // Whether "No folder" is empty is not asked for until it is opened, so it is there, folded, and "Pinned" is not.
    expect(await toggle('No folder')).toHaveAttribute('aria-expanded', 'false')
    expect(within(await explorer()).queryByRole('button', { name: 'Pinned' })).not.toBeInTheDocument()
    expect(await within(await explorer()).findByRole('button', { name: 'New document' })).toBeInTheDocument()
  })

  it('says which part could not load, and loads it again when asked to', async () => {
    let fail = true
    const { user } = renderScreen(openPath, {
      wrap: (dataSource) => ({
        ...dataSource,
        listFolders: async (request) => {
          if (fail) throw new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })
          return dataSource.listFolders(request)
        },
      }),
    })

    const column = await explorer()
    expect(await within(column).findByRole('heading', { name: 'Folders' })).toBeInTheDocument()

    fail = false
    await user.click(within(column).getByRole('button', { name: /^Try again/ }))

    expect(await toggle('Operaciones')).toBeInTheDocument()
  })
})
