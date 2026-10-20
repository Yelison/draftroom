import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { ApiError } from '../../data/errors.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { archivedNotice } from './archivedNotice.ts'
import { fixtures, renderScreen, workspaceFixtures } from './testing/renderScreen.tsx'

const { launchPlan, designReview, weeklyEnglish, interviews, interviewsSpanish } = fixtures
const heading = () => screen.findByRole('heading', { level: 1, name: 'Documents' })
const main = () => screen.getByRole('main')
const searchbox = () => within(main()).getByRole('searchbox', { name: 'Search documents' })
const section = (name: string) => within(main()).findByRole('region', { name })
/** What the live regions of the work area say now: the notice of an archive is always there, empty until it has something. */
const spoken = () =>
  within(main())
    .getAllByRole('status')
    .map((region) => region.textContent)
const unavailable = () => new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })
const linksOf = (region: HTMLElement) =>
  within(region)
    .getAllByRole('link')
    .map((link) => link.textContent)

type Request = Parameters<DataSource['listDocuments']>[0]
/** Makes a call of `listDocuments` smaller, or fail, for the lists that `matches` says; it leaves the others alone. */
const changeLists =
  (matches: (query: NonNullable<Request>['params']['query']) => boolean, change: (request: Request) => Request) =>
  (dataSource: DataSource): DataSource => ({
    ...dataSource,
    listDocuments: (request) => dataSource.listDocuments(matches(request?.params.query) ? change(request) : request),
  })
const pagesOf = (limit: number) =>
  changeLists(
    () => true,
    (request) => ({
      params: {
        path: { workspaceId: request?.params.path.workspaceId ?? '' },
        query: { ...request?.params.query, limit },
      },
    }),
  )

describe('the sections of the Documents screen', () => {
  it('lists the pinned documents first, then a section for each folder, then the documents in no folder', async () => {
    renderScreen('/documents')
    await heading()

    await section('No folder')
    expect(
      within(main())
        .getAllByRole('heading', { level: 2 })
        .map((title) => title.textContent),
    ).toEqual(['Pinned', 'Ideas', 'Operaciones', 'Product', 'Research', 'No folder'])
  })

  it('lists a pinned document in "Pinned" only, with the name of its folder, and not again in its folder', async () => {
    renderScreen('/documents')
    await heading()

    const pinned = await section('Pinned')
    expect(linksOf(pinned)).toEqual(['Autumn launch plan', 'Customer interview synthesis'])
    expect(within(pinned).getByText('In folder Product')).toBeInTheDocument()
    const product = await section('Product')
    expect(await within(product).findByRole('link', { name: designReview.title })).toBeInTheDocument()
    expect(linksOf(product)).toEqual([designReview.title])
    expect(linksOf(await section('Research'))).toEqual([interviewsSpanish.title])
  })

  it('links each title to its document', async () => {
    renderScreen('/documents')
    await heading()

    expect(await within(await section('Pinned')).findByRole('link', { name: 'Autumn launch plan' })).toHaveAttribute(
      'href',
      `/documents/${launchPlan.id}`,
    )
  })

  it('lists the documents that are in no folder under "No folder", asking the server for exactly those', async () => {
    const queries: unknown[] = []
    renderScreen('/documents', {
      wrap: changeLists(
        (query) => (queries.push(query), false),
        (request) => request,
      ),
    })
    await heading()

    const unfiled = await section('No folder')
    await within(unfiled).findAllByRole('link')
    expect(linksOf(unfiled)).not.toContain(launchPlan.title)
    expect(linksOf(unfiled)).toContain(weeklyEnglish.title)
    expect(queries).toContainEqual({ unfiled: true, limit: 5 })
  })

  it('draws a folder with no documents, with a line that says so, so it can still be seen and used', async () => {
    renderScreen('/documents')
    await heading()

    const ideas = await section('Ideas')

    expect(await within(ideas).findByText('No documents yet')).toBeInTheDocument()
    expect(within(ideas).queryByRole('link')).not.toBeInTheDocument()
  })

  it('does not list an archived document', async () => {
    renderScreen('/documents')
    await heading()

    await within(await section('Product')).findByRole('link', { name: designReview.title })
    expect(screen.queryByRole('link', { name: 'Old pricing draft' })).not.toBeInTheDocument()
  })

  it('does not draw "Pinned" when nothing is pinned, nor "No folder" when every document is in a folder', async () => {
    renderScreen('/documents', {
      wrap: (dataSource) => ({
        ...dataSource,
        listPinnedDocuments: async () => ({ items: [] }),
        listDocuments: async (request) => ({
          items: request?.params.query?.unfiled === true ? [] : (await dataSource.listDocuments(request)).items,
          nextCursor: null,
        }),
      }),
    })
    await heading()

    await section('Product')
    expect(screen.queryByRole('heading', { level: 2, name: 'Pinned' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'No folder' })).not.toBeInTheDocument()
  })

  it('does not say a folder is empty when everything in it is pinned', async () => {
    renderScreen('/documents', {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: async (request) => {
          const page = await dataSource.listDocuments(request)
          return { ...page, items: page.items.map((document) => ({ ...document, pinned: true })) }
        },
      }),
    })
    await heading()

    const product = await section('Product')

    expect(await within(product).findByText('Everything in this folder is pinned.')).toBeInTheDocument()
    expect(within(product).queryByText('No documents yet')).not.toBeInTheDocument()
  })
})

describe('folding a section', () => {
  const toggleOf = (name: string) => within(main()).findByRole('button', { name })

  it('hides its documents and says so to a screen reader, and shows them again', async () => {
    const { user } = renderScreen('/documents')
    await heading()
    const toggle = await toggleOf('Research')
    await within(await section('Research')).findByRole('link')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).toContainElement(
      screen.getByRole('link', { name: interviewsSpanish.title }),
    )

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: interviewsSpanish.title })).not.toBeInTheDocument()
    await user.click(toggle)
    expect(await screen.findByRole('link', { name: interviewsSpanish.title })).toBeInTheDocument()
  })

  it('folds with the keyboard, and keeps the focus on its button', async () => {
    const { user } = renderScreen('/documents')
    await heading()
    const toggle = await toggleOf('Research')

    toggle.focus()
    await user.keyboard('{Enter}')

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveFocus()
  })

  it('asks for nothing while it is folded, even when the lists are read again', async () => {
    const researchCalls: unknown[] = []
    let unfiledCalls = 0
    const { user, queryClient } = renderScreen('/documents', {
      wrap: changeLists(
        (query) => {
          if (query?.folderId === workspaceFixtures.researchFolder.id) researchCalls.push(query)
          if (query?.unfiled === true) unfiledCalls += 1
          return false
        },
        (request) => request,
      ),
    })
    await heading()
    await within(await section('Research')).findByRole('link')
    await user.click(await toggleOf('Research'))
    const researchBefore = researchCalls.length
    const unfiledBefore = unfiledCalls

    await act(() => queryClient.invalidateQueries({ queryKey: ['workspaces'] }))

    await waitFor(() => expect(unfiledCalls).toBeGreaterThan(unfiledBefore))
    expect(researchCalls).toHaveLength(researchBefore)
  })

  it('keeps what is folded while a search is typed and cleared', async () => {
    const { user } = renderScreen('/documents')
    await heading()
    await user.click(await toggleOf('Research'))

    await user.type(searchbox(), 'weekly')
    await screen.findByText('Weekly update — October 6')
    expect(screen.queryByRole('heading', { level: 2, name: 'Research' })).not.toBeInTheDocument()
    await user.clear(searchbox())

    expect(await toggleOf('Research')).toHaveAttribute('aria-expanded', 'false')
    expect(await toggleOf('Product')).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('the pages of a section', () => {
  it('asks for the next page when a page brings only pinned documents, and never shows "Show more" over no rows', async () => {
    const researchPages: unknown[] = []
    renderScreen('/documents', {
      wrap: (dataSource) =>
        pagesOf(1)({
          ...dataSource,
          listDocuments: (request) => {
            if (request?.params.query?.folderId === workspaceFixtures.researchFolder.id) {
              researchPages.push(request.params.query.cursor)
            }
            return dataSource.listDocuments(request)
          },
        }),
    })
    await heading()
    const research = await section('Research')

    expect(await within(research).findByRole('link', { name: interviewsSpanish.title })).toBeInTheDocument()
    expect(within(research).queryByRole('link', { name: interviews.title })).not.toBeInTheDocument()
    expect(within(research).queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument()
    expect(researchPages).toHaveLength(2)
  })

  it('shows more of one section when asked, and moves the focus to the first document that arrived', async () => {
    const { user } = renderScreen('/documents', { wrap: pagesOf(2) })
    await heading()
    const unfiled = await section('No folder')
    expect(await within(unfiled).findAllByRole('link')).toHaveLength(2)

    await user.click(within(unfiled).getByRole('button', { name: 'Show more in No folder' }))

    await waitFor(() => expect(within(unfiled).getAllByRole('link')).toHaveLength(4))
    await waitFor(() => expect(within(unfiled).getAllByRole('link')[2]).toHaveFocus())
  })

  it('loads one section at a time: "Show more" asks for the pages of its own section only', async () => {
    const afterTheFirstPage: unknown[] = []
    const { user } = renderScreen('/documents', {
      wrap: (dataSource) =>
        pagesOf(2)({
          ...dataSource,
          listDocuments: (request) => {
            if (request?.params.query?.cursor !== undefined) afterTheFirstPage.push(request.params.query.unfiled)
            return dataSource.listDocuments(request)
          },
        }),
    })
    await heading()
    const unfiled = await section('No folder')
    await user.click(await within(unfiled).findByRole('button', { name: 'Show more in No folder' }))

    await waitFor(() => expect(within(unfiled).getAllByRole('link')).toHaveLength(4))
    expect(afterTheFirstPage).toEqual([true])
  })

  it('stops offering more once the last page is in, and keeps the focus on the page', async () => {
    const { user } = renderScreen('/documents', { wrap: pagesOf(3) })
    await heading()
    const unfiled = await section('No folder')

    await user.click(await within(unfiled).findByRole('button', { name: 'Show more in No folder' }))

    await waitFor(() => expect(within(unfiled).getAllByRole('link')).toHaveLength(5))
    expect(within(unfiled).queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument()
    expect(document.body).not.toHaveFocus()
  })

  it('says when more could not be loaded, keeps what is there, and loads it on the next try', async () => {
    let fail = true
    const { user } = renderScreen('/documents', {
      wrap: (dataSource) =>
        pagesOf(3)({
          ...dataSource,
          listDocuments: async (request) => {
            if (fail && request?.params.query?.cursor !== undefined) throw unavailable()
            return dataSource.listDocuments(request)
          },
        }),
    })
    await heading()
    const unfiled = await section('No folder')
    await user.click(await within(unfiled).findByRole('button', { name: 'Show more in No folder' }))

    expect(await within(unfiled).findByRole('alert')).toHaveTextContent("We couldn't load more documents.")
    expect(within(unfiled).getAllByRole('link')).toHaveLength(3)
    fail = false
    await user.click(within(unfiled).getByRole('button', { name: 'Show more in No folder' }))

    await waitFor(() => expect(within(unfiled).getAllByRole('link')).toHaveLength(5))
  })

  it('shows that more is on its way, on the button that asked for it', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const { user } = renderScreen('/documents', {
      wrap: (dataSource) =>
        pagesOf(3)({
          ...dataSource,
          listDocuments: async (request) => {
            if (request?.params.query?.cursor !== undefined) await held
            return dataSource.listDocuments(request)
          },
        }),
    })
    await heading()
    const unfiled = await section('No folder')

    await user.click(await within(unfiled).findByRole('button', { name: 'Show more in No folder' }))

    expect(within(unfiled).getByRole('button', { name: 'Show more in No folder' })).toHaveAttribute('aria-busy', 'true')
    await act(async () => release())
  })
})

describe('the states of the Documents screen', () => {
  it('shows the shape of the sections, with a spoken status, while the folders are on their way', async () => {
    let called = false
    renderScreen('/documents', {
      wrap: (dataSource) => ({
        ...dataSource,
        listFolders: () => {
          called = true
          return new Promise(() => {})
        },
      }),
    })
    await heading()

    // The workspace is read first: only once the folders are asked for is there something to wait for.
    await waitFor(() => expect(called).toBe(true))
    await waitFor(() => expect(spoken()).toContain('Loading documents'))
    expect(screen.queryByText('No documents yet')).not.toBeInTheDocument()
    expect(within(main()).queryByRole('region')).not.toBeInTheDocument()
    expect(main().querySelector('[aria-busy="true"] li')).not.toBeNull()
  })

  it('keeps the headline, and the focus on it, from the loading state to the sections', async () => {
    const { router } = renderScreen('/shared')
    await screen.findByRole('heading', { level: 1, name: 'Shared' })

    await act(() => router.navigate('/documents'))

    const title = await heading()
    expect(title).toHaveFocus()
    await screen.findByRole('link', { name: 'Autumn launch plan' })
    expect(title).toHaveFocus()
  })

  it('invites the person to create the first document when the workspace has no folder and no document', async () => {
    renderScreen('/documents', {
      wrap: (dataSource) => ({
        ...dataSource,
        listFolders: async () => ({ items: [] }),
        listPinnedDocuments: async () => ({ items: [] }),
        listDocuments: async () => ({ items: [], nextCursor: null }),
      }),
    })
    await heading()

    expect(await screen.findByText('No documents yet')).toBeInTheDocument()
    expect(within(main()).queryByRole('region')).not.toBeInTheDocument()
    expect(within(main()).getAllByRole('button', { name: 'New document' })).toHaveLength(2)
  })

  it('says a section could not load, loads it again when asked, and leaves the other sections as they are', async () => {
    let fail = true
    const { user } = renderScreen('/documents', {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: async (request) => {
          if (fail && request?.params.query?.folderId === workspaceFixtures.productFolder.id) throw unavailable()
          return dataSource.listDocuments(request)
        },
      }),
    })
    await heading()
    const product = await section('Product')

    expect(await within(product).findByRole('alert')).toHaveTextContent("We couldn't load these documents.")
    expect(await within(await section('Research')).findByRole('link', { name: interviewsSpanish.title })).toBeVisible()
    expect(within(await section('Pinned')).getAllByRole('link')).toHaveLength(2)
    fail = false
    await user.click(within(product).getByRole('button', { name: 'Try again to load Product' }))

    expect(await within(product).findByRole('link', { name: designReview.title })).toBeInTheDocument()
    expect(within(product).queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    { read: 'the folders', retry: 'Try again to load Folders', fails: 'listFolders', stays: 'No folder' },
    {
      read: 'the pinned documents',
      retry: 'Try again to load Pinned',
      fails: 'listPinnedDocuments',
      stays: 'No folder',
    },
  ] as const)('says $read could not load, and the other sections stay', async ({ retry, fails, stays }) => {
    let fail = true
    const { user } = renderScreen('/documents', {
      wrap: (dataSource) => ({
        ...dataSource,
        [fails]: async (request: never) => {
          if (fail) throw unavailable()
          return (dataSource[fails] as (request: never) => Promise<unknown>)(request)
        },
      }),
    })
    await heading()

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load these documents.")
    expect(await section(stays)).toBeInTheDocument()
    fail = false
    await user.click(within(main()).getByRole('button', { name: retry }))

    await waitFor(() => expect(within(main()).queryByRole('alert')).not.toBeInTheDocument())
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
  it('replaces the sections with the documents that match, and says how many', async () => {
    const { user } = renderScreen('/documents')
    await heading()
    await section('Pinned')

    await user.type(searchbox(), 'weekly')

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Pinned' })).not.toBeInTheDocument())
    expect(
      within(main())
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Weekly update — October 6'])
    await waitFor(() => expect(spoken()).toContain('1 result'))
  })

  it('brings the sections back, as they were, when the search is cleared', async () => {
    const { user } = renderScreen('/documents')
    await heading()
    await section('Pinned')
    await user.type(searchbox(), 'weekly')
    await screen.findByText('Weekly update — October 6')

    await user.clear(searchbox())

    expect(await section('Pinned')).toBeInTheDocument()
    expect(await section('No folder')).toBeInTheDocument()
  })

  it('says so when nothing matches, and keeps the search for the person to change', async () => {
    const { user } = renderScreen('/documents')
    await heading()
    await section('Pinned')

    await user.type(searchbox(), 'zzzz')

    expect(await screen.findByText('No results for “zzzz”')).toBeInTheDocument()
    expect(searchbox()).toHaveValue('zzzz')
  })

  it('opens the results page with Enter, and does nothing with Enter on a field with nothing in it', async () => {
    const { user, router } = renderScreen('/documents')
    await heading()
    await section('Pinned')
    searchbox().focus()

    await user.keyboard('{Enter}')
    expect(router.state.location.pathname).toBe('/documents')
    await user.type(searchbox(), 'weekly{Enter}')

    await waitFor(() => expect(router.state.location.pathname).toBe('/search'))
    expect(router.state.location.search).toBe('?q=weekly')
  })

  it('sends the search without the spaces around it, and never an empty one', async () => {
    const queries: unknown[] = []
    const { user } = renderScreen('/documents', {
      wrap: changeLists(
        (query) => (queries.push(query?.query), false),
        (request) => request,
      ),
    })
    await heading()
    await section('Pinned')

    await user.type(searchbox(), '  weekly  ')
    await waitFor(() => expect(queries).toContain('weekly'))
    await user.clear(searchbox())
    await user.type(searchbox(), '   ')

    expect(queries).not.toContain('  weekly  ')
    expect(queries).not.toContain('')
  })
})

describe('a person who belongs to no workspace', () => {
  it.each([
    { screen: 'Documents', path: '/documents' },
    { screen: 'a folder', path: `/folders/${workspaceFixtures.productFolder.id}` },
  ])('is told so on $screen, and is not shown a failure to retry', async ({ path }) => {
    renderScreen(path, { wrap: (dataSource) => ({ ...dataSource, listWorkspaces: async () => ({ items: [] }) }) })

    expect(await screen.findByText("You're not in a workspace yet")).toBeInTheDocument()
    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
    expect(within(main()).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('is told so in Spanish too', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/documents', {
      wrap: (dataSource) => ({ ...dataSource, listWorkspaces: async () => ({ items: [] }) }),
    })

    expect(await screen.findByText('Aún no estás en ningún espacio de trabajo')).toBeInTheDocument()
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

  it('takes the notice out of the history, so reloading the page does not announce it again', async () => {
    const { router } = renderScreen('/shared')
    await screen.findByRole('heading', { level: 1, name: 'Shared' })

    await act(() => router.navigate('/documents', { state: archivedNotice('Autumn launch plan') }))

    await waitFor(() => expect(router.state.location.state).toBeNull())
    expect(router.state.location.pathname).toBe('/documents')
    await waitFor(() => expect(spoken()).toContain('“Autumn launch plan” was archived.'))
  })

  it('does not announce it again when the person comes back to the screen', async () => {
    const { router } = renderScreen('/shared')
    await screen.findByRole('heading', { level: 1, name: 'Shared' })
    await act(() => router.navigate('/documents', { state: archivedNotice('Autumn launch plan') }))
    await waitFor(() => expect(router.state.location.state).toBeNull())

    await act(() => router.navigate('/history'))
    await screen.findByRole('heading', { level: 1, name: 'History' })
    await act(() => router.navigate(-1))

    await screen.findByRole('link', { name: 'Autumn launch plan' })
    expect(within(main()).getByRole('status')).toBeEmptyDOMElement()
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
    expect(await screen.findByRole('heading', { level: 2, name: 'Fijados' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 2, name: 'Sin carpeta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nuevo documento' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Más' })).toBeInTheDocument()
    const updated = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(launchPlan.updatedAt),
    )
    expect(screen.getAllByText(updated).length).toBeGreaterThan(0)

    await user.type(screen.getByRole('searchbox', { name: 'Buscar documentos' }), 'semanal')
    await waitFor(() => expect(spoken()).toContain('1 resultado'))
  })
})
