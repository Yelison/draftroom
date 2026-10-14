import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../data/errors.ts'
import { fixtures, renderScreen } from '../documents/testing/renderScreen.tsx'

const openPath = `/documents/${fixtures.launchPlan.id}/share`
const tree = () => screen.findByRole('tree', { name: 'Documents and folders' })
const row = (name: string, index = 0) => screen.getAllByRole('treeitem', { name })[index] as HTMLElement

describe('the explorer beside a document', () => {
  it('lists Recent, the folders with their documents and the documents that are in no folder', async () => {
    renderScreen(openPath)

    const items = within(await tree()).getAllByRole('treeitem')
    const names = items.map((item) => item.textContent)
    expect(names.slice(0, 1)).toEqual(['Recent'])
    expect(names).toContain('Operaciones')
    expect(names).toContain('Weekly update — October 6')
    // A folder is closed until it is opened: its document is in the tree once, under Recent, and not yet in the folder.
    expect(row('Operaciones')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByRole('treeitem', { name: 'Presupuesto 2027' })).toHaveLength(1)
  })

  it('does not list an archived document', async () => {
    renderScreen(openPath)
    await tree()

    expect(screen.queryByRole('treeitem', { name: 'Old pricing draft' })).not.toBeInTheDocument()
  })

  it('opens the folder that holds the open document, and marks that document as the selected one', async () => {
    renderScreen(openPath)
    await tree()

    expect(row('Product')).toHaveAttribute('aria-expanded', 'true')
    const selected = screen
      .getAllByRole('treeitem', { name: 'Autumn launch plan' })
      .filter((item) => item.getAttribute('aria-selected') === 'true')
    expect(selected.length).toBeGreaterThan(0)
    expect(screen.getAllByRole('treeitem', { name: 'Notas de la revisión de diseño' })[0]).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('moves the selection to the document that is opened, and takes it off the one that was open', async () => {
    const { router } = renderScreen(openPath)
    await tree()

    await act(() => router.navigate(`/documents/${fixtures.weeklyEnglish.id}/share`))

    await waitFor(() =>
      expect(screen.getAllByRole('treeitem', { name: 'Weekly update — October 6' })[0]).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
    for (const item of screen.getAllByRole('treeitem', { name: 'Autumn launch plan' })) {
      expect(item).toHaveAttribute('aria-selected', 'false')
    }
  })

  it('keeps the selection where it is while the keyboard walks to another row', async () => {
    const { user } = renderScreen(openPath)
    await tree()
    // Tab: skip link, five rail items, search, new document, new folder, then the tree.
    for (let stop = 0; stop < 10; stop++) await user.tab()
    const stopRow = document.activeElement as HTMLElement
    expect(stopRow).toHaveAttribute('role', 'treeitem')

    await user.keyboard('{ArrowDown}{ArrowDown}')

    const focused = document.activeElement as HTMLElement
    expect(focused).not.toBe(stopRow)
    expect(focused).toHaveAttribute('aria-selected', 'false')
    expect(
      screen.getAllByRole('treeitem').filter((item) => item.getAttribute('aria-selected') === 'true').length,
    ).toBeGreaterThan(0)
  })

  it('is one stop of the Tab key, and it is the open document', async () => {
    const { user } = renderScreen(openPath)
    await tree()

    for (let stop = 0; stop < 10; stop++) await user.tab()

    const stopRow = document.activeElement as HTMLElement
    expect(stopRow).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('treeitem').filter((item) => item.tabIndex === 0)).toEqual([stopRow])
    await user.tab()
    expect(
      within(await tree())
        .queryAllByRole('treeitem')
        .includes(document.activeElement as HTMLElement),
    ).toBe(false)
  })

  it('opens a document with Enter', async () => {
    const { user, router } = renderScreen(openPath)
    await tree()
    row('Weekly update — October 6').focus()

    await user.keyboard('{Enter}')

    await waitFor(() => expect(router.state.location.pathname).toBe(`/documents/${fixtures.weeklyEnglish.id}`))
  })

  it('opens and closes a folder with the arrow keys', async () => {
    const { user } = renderScreen(openPath)
    await tree()
    row('Operaciones').focus()

    await user.keyboard('{ArrowRight}')
    expect(row('Operaciones')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('treeitem', { name: 'Presupuesto 2027' })).toHaveLength(2)

    await user.keyboard('{ArrowLeft}')
    expect(row('Operaciones')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByRole('treeitem', { name: 'Presupuesto 2027' })).toHaveLength(1)
  })

  it('goes to the first and last row with Home and End', async () => {
    const { user } = renderScreen(openPath)
    await tree()
    row('Operaciones').focus()

    await user.keyboard('{End}')
    const items = screen.getAllByRole('treeitem')
    expect(document.activeElement).toBe(items.at(-1))

    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(items[0])
  })

  it('finds a row by typing the start of its name', async () => {
    const { user } = renderScreen(openPath)
    await tree()
    row('Recent').focus()

    await user.keyboard('onb')

    expect(document.activeElement).toHaveAccessibleName(/^Onboarding/)
  })

  it('opens a document with a click and a folder too', async () => {
    const { user, router } = renderScreen(openPath)
    await tree()

    await user.click(row('Operaciones'))
    expect(row('Operaciones')).toHaveAttribute('aria-expanded', 'true')

    await user.click(row('Presupuesto 2027', 1))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/documents/${fixtures.budget.id}`))
  })
})

describe('the search of the explorer', () => {
  it('asks the server for the documents that match, and lists them flat', async () => {
    const queries: unknown[] = []
    const { user } = renderScreen(openPath, {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: (request) => {
          queries.push(request?.params.query?.query)
          return dataSource.listDocuments(request)
        },
      }),
    })
    await tree()

    await user.type(screen.getByRole('searchbox', { name: 'Search documents' }), ' brand ')

    const results = await screen.findByRole('tree', { name: 'Results' })
    expect(
      within(results)
        .getAllByRole('treeitem')
        .map((item) => item.textContent),
    ).toEqual(['Brand voice guide'])
    expect(queries).toContain('brand')
    expect(queries.at(-1)).not.toBe(' brand ')
  })

  it('says so when nothing matches, and does not ask the server for an empty search', async () => {
    const queries: unknown[] = []
    const { user } = renderScreen(openPath, {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: (request) => {
          queries.push(request?.params.query?.query)
          return dataSource.listDocuments(request)
        },
      }),
    })
    await tree()

    await user.type(screen.getByRole('searchbox', { name: 'Search documents' }), 'zzzz')
    expect(await screen.findByText('No results for “zzzz”')).toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: 'Search documents' }))
    expect(await screen.findByRole('tree', { name: 'Documents and folders' })).toBeInTheDocument()
    expect(queries).not.toContain('')
  })
})

describe('the states of the explorer', () => {
  it('shows rows of the height of the real ones, with a spoken status, while it loads', async () => {
    let arrive: (() => void) | undefined
    renderScreen(openPath, {
      wrap: (dataSource) => ({
        ...dataSource,
        listFolders: (request) => new Promise((resolve) => (arrive = () => resolve(dataSource.listFolders(request)))),
      }),
    })

    const explorer = await screen.findByRole('complementary', { name: 'Explorer' })
    await waitFor(() => expect(within(explorer).getByRole('status')).toHaveTextContent('Loading documents'))
    expect(within(explorer).queryByRole('tree')).not.toBeInTheDocument()

    // The call may not have been made yet: the workspace is read first.
    await waitFor(() => expect(arrive).toBeDefined())
    await act(async () => arrive?.())
    expect(await tree()).toBeInTheDocument()
  })

  it('says there is nothing yet when the workspace has no document and no folder', async () => {
    renderScreen(openPath, {
      wrap: (dataSource) => ({
        ...dataSource,
        listFolders: async () => ({ items: [] }),
        listDocuments: async () => ({ items: [], nextCursor: null }),
      }),
    })

    expect(await screen.findByText('No documents yet')).toBeInTheDocument()
    expect(screen.queryByRole('tree')).not.toBeInTheDocument()
  })

  it('says it could not load, and loads again when asked to', async () => {
    let fail = true
    const { user } = renderScreen(openPath, {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: async (request) => {
          if (fail) throw new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })
          return dataSource.listDocuments(request)
        },
      }),
    })

    const explorer = await screen.findByRole('complementary', { name: 'Explorer' })
    expect(await within(explorer).findByRole('alert')).toHaveTextContent("We couldn't load your documents")

    fail = false
    await user.click(within(explorer).getByRole('button', { name: 'Try again' }))

    expect(await tree()).toBeInTheDocument()
  })
})
