import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { ApiError } from '../../data/errors.ts'
import { daniel } from '../../data/mock/fixtures/index.ts'
import { fixtures, renderScreen } from '../documents/testing/renderScreen.tsx'

const openPath = `/documents/${fixtures.launchPlan.id}/share`
const tree = () => screen.findByRole('tree', { name: 'Documents and folders' })
const row = (name: string, index = 0) => screen.getAllByRole('treeitem', { name })[index] as HTMLElement

const selectedRows = () =>
  screen.getAllByRole('treeitem').filter((item) => item.getAttribute('aria-selected') === 'true')

describe('the explorer beside a document', () => {
  it('selects the open document once: the row under Recent is drawn as open and is not a second selection', async () => {
    renderScreen(openPath)
    await tree()

    const [underRecent, underFolder] = screen.getAllByRole('treeitem', { name: 'Autumn launch plan' })
    expect(underRecent).toHaveAttribute('data-variant', 'selected')
    expect(underRecent).toHaveAttribute('aria-selected', 'false')
    expect(underFolder).toHaveAttribute('aria-selected', 'true')
    expect(selectedRows()).toHaveLength(1)
  })

  // What a row answers to besides the keys of the tree, by what the person may do with it.
  it.each([
    { name: 'a document the person owns', row: 'Autumn launch plan', shortcuts: 'F2 Delete', as: undefined },
    { name: 'a folder', row: 'Operaciones', shortcuts: 'F2', as: undefined },
    { name: 'a document the person can edit', row: 'Autumn launch plan', shortcuts: 'F2', as: daniel.email },
    { name: 'a document the person can only read', row: 'Presupuesto 2027', shortcuts: null, as: daniel.email },
  ])('announces the shortcuts of $name', async ({ row: name, shortcuts, as }) => {
    renderScreen(openPath, as === undefined ? {} : { signedInAs: as })
    await tree()

    const item = row(name)
    if (shortcuts === null) expect(item).not.toHaveAttribute('aria-keyshortcuts')
    else expect(item).toHaveAttribute('aria-keyshortcuts', shortcuts)
  })

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
    expect(selectedRows().map((item) => item.textContent)).toEqual(['Autumn launch plan'])
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
      expect(screen.getAllByRole('treeitem', { name: 'Weekly update — October 6' }).at(-1)).toHaveAttribute(
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

    await user.keyboard('{ArrowDown}')

    const focused = document.activeElement as HTMLElement
    expect(focused).not.toBe(stopRow)
    expect(focused).toHaveAttribute('aria-selected', 'false')
    expect(selectedRows()).toHaveLength(1)
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

describe('the pages of the explorer', () => {
  const smallPages = (dataSource: DataSource): DataSource => ({
    ...dataSource,
    listDocuments: (request) =>
      dataSource.listDocuments({
        ...request,
        params: { path: request.params.path, query: { ...request.params.query, limit: 3 } },
      }),
  })

  it('keeps the focus in the tree once "Load more" is gone', async () => {
    const { user } = renderScreen(openPath, { wrap: smallPages })
    await tree()

    // Ten documents in pages of three: the button is pressed until it goes.
    for (let pages = 0; pages < 3; pages++) {
      const more = screen.getByRole('button', { name: 'Load more' })
      more.focus()
      await user.click(more)
      await waitFor(() => expect(screen.getAllByRole('treeitem').length).toBeGreaterThan(pages + 8))
    }

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getAllByRole('treeitem')).toContain(document.activeElement))
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
    // The workspace is read first: only once the folders are asked for is there something to wait for.
    await waitFor(() => expect(arrive).toBeDefined())
    await waitFor(() =>
      expect(
        within(explorer)
          .getAllByRole('status')
          .map((region) => region.textContent),
      ).toContain('Loading documents'),
    )
    expect(within(explorer).queryByText('No documents yet')).not.toBeInTheDocument()
    expect(within(explorer).queryByRole('tree')).not.toBeInTheDocument()

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
