import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { ApiError } from '../../data/errors.ts'
import { queryKeys } from '../../data/queryKeys.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { fixtures, renderScreen } from '../documents/testing/renderScreen.tsx'

const main = () => screen.getByRole('main')
const searchbox = () => within(main()).getByRole('searchbox', { name: 'Search documents' })
const heading = (name: string) => screen.findByRole('heading', { level: 1, name })
const unavailable = () => new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })

/** Counts what the screen asks the server for, and what it asks the documents with. */
function watch(dataSource: DataSource) {
  const calls = { workspaces: 0, queries: [] as (string | undefined)[], limits: [] as (number | undefined)[] }
  const watched: DataSource = {
    ...dataSource,
    listWorkspaces: () => {
      calls.workspaces++
      return dataSource.listWorkspaces()
    },
    listDocuments: (request) => {
      calls.queries.push(request?.params.query?.query)
      calls.limits.push(request?.params.query?.limit)
      return dataSource.listDocuments(request)
    },
  }
  return { calls, watched }
}

describe('the search results screen', () => {
  it('keeps its headline and the text of the search, and lists the documents that match', async () => {
    renderScreen('/search?q=weekly')

    await heading('Search documents')
    expect(await within(main()).findByRole('link', { name: 'Weekly update — October 6' })).toHaveAttribute(
      'href',
      `/documents/${fixtures.weeklyEnglish.id}`,
    )
    expect(within(main()).queryByRole('link', { name: 'Autumn launch plan' })).not.toBeInTheDocument()
    expect(searchbox()).toHaveValue('weekly')
    expect(document.title).toBe('Search documents · Draftroom')
  })

  it('finds a document by its excerpt, and never lists an archived one', async () => {
    renderScreen('/search?q=pricing')

    await heading('Search documents')
    expect(await within(main()).findByRole('link', { name: 'Autumn launch plan' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Old pricing draft' })).not.toBeInTheDocument()
  })

  it('keeps the layout of the list while it loads, and says that it is loading', async () => {
    let arrive: (() => void) | undefined
    renderScreen('/search?q=weekly', {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: (request) =>
          new Promise((resolve) => (arrive = () => resolve(dataSource.listDocuments(request)))),
      }),
    })
    await heading('Search documents')

    // Once the documents are asked for, the skeleton of the list is the one that stays until they arrive.
    await waitFor(() => expect(arrive).toBeDefined())
    expect(within(main()).getByText('Loading documents')).toBeInTheDocument()
    expect(within(main()).queryByRole('link')).not.toBeInTheDocument()

    await act(async () => arrive?.())
    expect(await within(main()).findByRole('link', { name: 'Weekly update — October 6' })).toBeInTheDocument()
  })

  it('says so, with what was searched, when nothing matches', async () => {
    renderScreen('/search?q=zzzz')

    expect(await screen.findByText('No results for “zzzz”')).toBeInTheDocument()
    expect(within(main()).queryByRole('link')).not.toBeInTheDocument()
    expect(searchbox()).toHaveValue('zzzz')
  })

  it('offers to try again when the documents could not be read, and lists them once they can', async () => {
    let failures = 1
    const { user } = renderScreen('/search?q=weekly', {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: (request) => {
          if (failures-- > 0) return Promise.reject(unavailable())
          return dataSource.listDocuments(request)
        },
      }),
    })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load your documents")
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))

    expect(await within(main()).findByRole('link', { name: 'Weekly update — October 6' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('loads the next page when asked, and moves the focus to the first document that arrived', async () => {
    const { user } = renderScreen('/search?q=a', {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: (request) =>
          dataSource.listDocuments({
            ...request,
            params: {
              path: { workspaceId: request?.params.path.workspaceId ?? '' },
              query: { ...request?.params.query, limit: 2 },
            },
          }),
      }),
    })
    await heading('Search documents')
    expect(await within(main()).findAllByRole('link')).toHaveLength(2)

    await user.click(within(main()).getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(within(main()).getAllByRole('link').length).toBeGreaterThan(2))
    await waitFor(() => expect(within(main()).getAllByRole('link')[2]).toHaveFocus())
  })

  it('says how many results there are, in a live region', async () => {
    renderScreen('/search?q=weekly')

    await within(main()).findByRole('link', { name: 'Weekly update — October 6' })
    await waitFor(() =>
      expect(
        within(main())
          .getAllByRole('status')
          .map((region) => region.textContent),
      ).toContain('1 result'),
    )
  })
})

describe('the search URL', () => {
  it.each([
    ['has no q', '/search'],
    ['has an empty q', '/search?q='],
    ['has a q of spaces', '/search?q=%20%20'],
  ])('invites to search, and asks the server for nothing, when it %s', async (_name, path) => {
    const watching: { current?: ReturnType<typeof watch> } = {}
    const { queryClient } = renderScreen(path, { wrap: (dataSource) => (watching.current = watch(dataSource)).watched })

    await heading('Search documents')
    expect(screen.getByText('Search your documents')).toBeInTheDocument()
    expect(searchbox()).toHaveValue('')
    // Anything the screen would ask would have been asked by now: the workspace is the first thing it reads. The rail
    // reads it too, and a query that two readers share is fetched once, so the calls cannot tell them apart: the readers
    // can. One is the rail's, and the screen, with nothing to search for, is not another.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(queryClient.getQueryCache().find({ queryKey: queryKeys.workspaces() })?.getObserversCount()).toBe(1)
    expect(watching.current?.calls.queries).toEqual([])
  })

  it('is trimmed and cut to the length the contract accepts before it is searched or shown', async () => {
    const watching: { current?: ReturnType<typeof watch> } = {}
    renderScreen(`/search?q=${encodeURIComponent(`  ${'x'.repeat(250)}  `)}`, {
      wrap: (dataSource) => (watching.current = watch(dataSource)).watched,
    })

    await heading('Search documents')
    expect(searchbox()).toHaveValue('x'.repeat(200))
    await waitFor(() => expect(watching.current?.calls.queries).toEqual(['x'.repeat(200)]))
  })

  it('is read as the text it is, whatever characters it holds', async () => {
    const watching: { current?: ReturnType<typeof watch> } = {}
    renderScreen('/search?q=a%26b%23c%25d', { wrap: (dataSource) => (watching.current = watch(dataSource)).watched })

    await heading('Search documents')
    await waitFor(() => expect(watching.current?.calls.queries).toEqual(['a&b#c%d']))
  })
})

describe('searching again from the results', () => {
  it('puts the new search in the URL when Enter is pressed, and keeps the focus in the field', async () => {
    const { user, router } = renderScreen('/search?q=weekly')
    await heading('Search documents')

    await user.clear(searchbox())
    await user.type(searchbox(), '  launch {Enter}')

    await waitFor(() => expect(router.state.location.search).toBe('?q=launch'))
    expect(await within(main()).findByRole('link', { name: 'Autumn launch plan' })).toBeInTheDocument()
    expect(searchbox()).toHaveFocus()
  })

  it('does not search anything new, or leave, until Enter is pressed', async () => {
    const { user, router } = renderScreen('/search?q=weekly')
    await heading('Search documents')

    await user.clear(searchbox())
    await user.type(searchbox(), 'launch')

    expect(router.state.location.search).toBe('?q=weekly')
    expect(within(main()).getByRole('link', { name: 'Weekly update — October 6' })).toBeInTheDocument()
    expect(within(main()).queryByRole('link', { name: 'Autumn launch plan' })).not.toBeInTheDocument()
  })

  it('does nothing when Enter is pressed on an empty field', async () => {
    const { user, router } = renderScreen('/search?q=weekly')
    await heading('Search documents')

    await user.clear(searchbox())
    await user.keyboard('{Enter}')

    expect(router.state.location.search).toBe('?q=weekly')
  })

  it('follows Back and Forward, the field and the results with them', async () => {
    const { user, router } = renderScreen('/search?q=weekly')
    await heading('Search documents')
    await user.clear(searchbox())
    await user.type(searchbox(), 'launch{Enter}')
    await within(main()).findByRole('link', { name: 'Autumn launch plan' })

    await act(() => router.navigate(-1))
    await heading('Search documents')
    expect(searchbox()).toHaveValue('weekly')
    expect(await within(main()).findByRole('link', { name: 'Weekly update — October 6' })).toBeInTheDocument()

    await act(() => router.navigate(1))
    expect(searchbox()).toHaveValue('launch')
    expect(await within(main()).findByRole('link', { name: 'Autumn launch plan' })).toBeInTheDocument()
  })
})

describe('the search results screen in Spanish', () => {
  it('is written in Spanish, the prompt and the results with it', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    const { router } = renderScreen('/search')

    expect(await screen.findByRole('heading', { level: 1, name: 'Buscar documentos' })).toBeInTheDocument()
    expect(screen.getByText('Busca en tus documentos')).toBeInTheDocument()

    await act(() => router.navigate('/search?q=semanal'))
    expect(await within(main()).findByRole('link', { name: /semanal/ })).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(main())
          .getAllByRole('status')
          .map((region) => region.textContent),
      ).toContain('1 resultado'),
    )
  })
})

describe('the actions of a result', () => {
  it('offers the owner of a document to archive it, as every list of documents does', async () => {
    const { user } = renderScreen('/search?q=launch')
    await user.click(await within(main()).findByRole('button', { name: 'Actions for Autumn launch plan' }))

    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem')

    expect(items.map((item) => item.textContent)).toEqual(['Rename or move', 'Archive'])
  })
})
