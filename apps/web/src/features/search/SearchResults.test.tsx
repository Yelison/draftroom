import type { Schema } from '@draftroom/contract'
import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { ApiError } from '../../data/errors.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { fixtures, renderScreen } from '../documents/testing/renderScreen.tsx'

const { launchPlan, weeklyEnglish } = fixtures
const main = () => screen.getByRole('main')
const searchbox = () => within(main()).getByRole('searchbox', { name: 'Search documents' })
const unavailable = () => new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })

const rowOf = async (title: string) => {
  const row = (await within(main()).findByRole('link', { name: title })).closest('li')
  if (row === null) throw new Error(`The link "${title}" is not in a row`)
  return row
}
const marksOf = (row: HTMLElement) =>
  within(row)
    .queryAllByRole('mark')
    .map((mark) => mark.textContent)
const countLine = () =>
  within(main())
    .queryAllByRole('status')
    .find((region) => /result/i.test(region.textContent ?? ''))

/** The documents of every answer, changed: a way to give a document another title or excerpt, or none. */
const changing =
  (change: (document: Schema<'Document'>) => Schema<'Document'>) =>
  (dataSource: DataSource): DataSource => ({
    ...dataSource,
    listDocuments: async (request) => {
      const page = await dataSource.listDocuments(request)
      return { ...page, items: page.items.map(change) }
    },
  })

/** Pages of two documents, to have more than one. */
const twoAtATime = (dataSource: DataSource): DataSource => ({
  ...dataSource,
  listDocuments: (request) =>
    dataSource.listDocuments({
      ...request,
      params: {
        path: { workspaceId: request?.params.path.workspaceId ?? '' },
        query: { ...request?.params.query, limit: 2 },
      },
    }),
})

describe('the results of a search', () => {
  it('mark the word in the title and in the excerpt, and the link is still named by the title alone', async () => {
    renderScreen('/search?q=launch')

    const row = await rowOf('Autumn launch plan')

    expect(marksOf(row)).toEqual(['launch', 'launch'])
    expect(within(row).getByRole('link')).toHaveAccessibleName('Autumn launch plan')
  })

  it('mark what matches in any case, and keep the case of the text', async () => {
    renderScreen('/search?q=LAUNCH')

    expect(marksOf(await rowOf('Autumn launch plan'))).toEqual(['launch', 'launch'])
  })

  it('say that a document has no text yet, with nothing to mark in it', async () => {
    renderScreen('/search?q=launch', { wrap: changing((document) => ({ ...document, excerpt: null })) })

    const row = await rowOf('Autumn launch plan')

    expect(within(row).getByText('No text yet')).toBeInTheDocument()
    expect(marksOf(row)).toEqual(['launch'])
  })

  it('show what people wrote as text, whatever it looks like', async () => {
    const title = '<b>launch</b> & <img src=x onerror=alert(1)>'
    renderScreen('/search?q=launch', {
      wrap: changing((document) => (document.id === launchPlan.id ? { ...document, title } : document)),
    })

    const row = await rowOf(title)

    expect(marksOf(row)).toEqual(['launch', 'launch'])
    expect(row.querySelector('b, img')).toBeNull()
  })

  it('bring a match that is far into the excerpt to the start of the line', async () => {
    const excerpt = `${'Headline options and the three proof points. '.repeat(3)}The launch moves to the 21st.`
    renderScreen('/search?q=launch', {
      wrap: changing((document) => (document.id === launchPlan.id ? { ...document, excerpt } : document)),
    })

    const row = await rowOf('Autumn launch plan')

    expect(marksOf(row)).toEqual(['launch', 'launch'])
    expect(row).toHaveTextContent(/…\S.{0,20}The launch moves to the 21st\./)
    expect(row).not.toHaveTextContent('Headline options')
  })
})

describe('the folder of a result', () => {
  it('names the folder of a document that is in one, and says "No folder" for one that is in none', async () => {
    renderScreen('/search?q=the')

    const inFolder = await rowOf('Autumn launch plan')
    const loose = await rowOf('Weekly update — October 6')

    await waitFor(() => expect(within(inFolder).getByText('In folder Product')).toBeInTheDocument())
    expect(within(inFolder).queryByText('No folder')).not.toBeInTheDocument()
    expect(within(loose).getByText('No folder')).toBeInTheDocument()
    expect(within(loose).queryByText(/^In folder/)).not.toBeInTheDocument()
  })

  it('says nothing about folders while they are on their way, so a document in one never reads as "No folder"', async () => {
    renderScreen('/search?q=the', {
      wrap: (dataSource) => ({ ...dataSource, listFolders: () => new Promise(() => {}) }),
    })

    await rowOf('Autumn launch plan')

    expect(main()).not.toHaveTextContent(/No folder|In folder/)
  })

  it('is said in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/search?q=de')

    const loose = await rowOf('Actualización semanal — 13 de octubre')

    await waitFor(() => expect(within(loose).getByText('Sin carpeta')).toBeInTheDocument())
  })
})

describe('the count of the results', () => {
  it.each([
    { case: 'one result', path: '/search?q=weekly', count: '1 result' },
    { case: 'several results', path: '/search?q=the', count: '5 results' },
    { case: 'none', path: '/search?q=zzzz', count: '0 results' },
  ])('says $case, where it can be read and in a live region', async ({ path, count }) => {
    renderScreen(path)

    await waitFor(() => expect(countLine()).toHaveTextContent(new RegExp(`^${count}$`)))
    expect(countLine()).toBeVisible()
  })

  it('does not make up a total when there are more pages: it says how many it has and that there are more', async () => {
    const { user } = renderScreen('/search?q=the', { wrap: twoAtATime })

    await waitFor(() => expect(countLine()).toHaveTextContent(/^2 or more results$/))
    await user.click(within(main()).getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(countLine()).toHaveTextContent(/^4 or more results$/))
    await user.click(within(main()).getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(countLine()).toHaveTextContent(/^5 results$/))
  })

  it('says "25 or more" when a full page is there and there is more', async () => {
    renderScreen('/search?q=launch', {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: async (request) => {
          const page = await dataSource.listDocuments(request)
          const [first] = page.items
          if (first === undefined) return page
          const items = Array.from({ length: 25 }, (_, index) => ({ ...first, id: `${first.id}-${index}` }))
          return { ...page, items, nextCursor: 'more' }
        },
      }),
    })

    await waitFor(() => expect(countLine()).toHaveTextContent(/^25 or more results$/))
  })
})

describe('the states of the results', () => {
  it('invites to search when there is nothing to search for, and says what it searches in', async () => {
    renderScreen('/search')

    expect(await screen.findByText('Search your documents')).toBeInTheDocument()
    expect(screen.getByText('Type a word from a title or from the start of a document and press Enter.')).toBeVisible()
    expect(searchbox()).toHaveAccessibleDescription('Searches titles and the first lines of each document.')
    expect(countLine()).toBeUndefined()
  })

  it('says what was searched and where else to look when nothing matches', async () => {
    renderScreen('/search?q=zzzz')

    expect(await screen.findByText('No results for “zzzz”')).toBeInTheDocument()
    expect(
      screen.getByText('Try another word, or open a folder from Documents and search inside it.'),
    ).toBeInTheDocument()
  })

  it('leaves no marks of the search before under the one that is on its way', async () => {
    let arrive: (() => void) | undefined
    const { user } = renderScreen('/search?q=weekly', {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: (request) =>
          request?.params.query?.query === 'launch'
            ? new Promise((resolve) => (arrive = () => resolve(dataSource.listDocuments(request))))
            : dataSource.listDocuments(request),
      }),
    })
    await rowOf(weeklyEnglish.title)

    await user.clear(searchbox())
    await user.type(searchbox(), 'launch{Enter}')

    await waitFor(() => expect(arrive).toBeDefined())
    expect(within(main()).queryByRole('link')).not.toBeInTheDocument()
    expect(within(main()).queryAllByRole('mark')).toHaveLength(0)
    expect(within(main()).getByText('Loading documents')).toBeInTheDocument()
    await act(async () => arrive?.())
    expect(marksOf(await rowOf('Autumn launch plan'))).toEqual(['launch', 'launch'])
  })

  it('keeps the live region of the count from one search to the next, so the new count is announced and not a new region', async () => {
    const { user } = renderScreen('/search?q=the')
    await waitFor(() => expect(countLine()).toHaveTextContent(/^5 results$/))
    const region = countLine()

    await user.clear(searchbox())
    await user.type(searchbox(), 'weekly{Enter}')

    await waitFor(() => expect(region).toHaveTextContent(/^1 result$/))
    expect(region).toBeInTheDocument()
    expect(countLine()).toBe(region)
  })

  it('puts the focus on the first result when the retry of the first page works', async () => {
    let failures = 1
    const { user } = renderScreen('/search?q=weekly', {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: (request) =>
          failures-- > 0 ? Promise.reject(unavailable()) : dataSource.listDocuments(request),
      }),
    })

    await user.click(await within(await screen.findByRole('alert')).findByRole('button', { name: 'Try again' }))

    const link = await within(main()).findByRole('link', { name: weeklyEnglish.title })
    await waitFor(() => expect(link).toHaveFocus())
  })

  it('puts the focus on the headline when the retry finds nothing, as there is no result to take it', async () => {
    let failures = 1
    const { user } = renderScreen('/search?q=zzzz', {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: (request) =>
          failures-- > 0 ? Promise.reject(unavailable()) : dataSource.listDocuments(request),
      }),
    })

    await user.click(await within(await screen.findByRole('alert')).findByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('No results for “zzzz”')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus())
  })

  it('shows that "Load more" is working while the next page is on its way', async () => {
    let arrive: (() => void) | undefined
    const { user } = renderScreen('/search?q=the', {
      wrap: (dataSource) => ({
        ...twoAtATime(dataSource),
        listDocuments: (request) =>
          request?.params.query?.cursor === undefined
            ? twoAtATime(dataSource).listDocuments(request)
            : new Promise((resolve) => (arrive = () => resolve(twoAtATime(dataSource).listDocuments(request)))),
      }),
    })
    await user.click(await within(main()).findByRole('button', { name: 'Load more' }))

    const button = within(main()).getByRole('button', { name: 'Loading…' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(within(main()).getAllByRole('link')).toHaveLength(2)

    await act(async () => arrive?.())
    await waitFor(() => expect(within(main()).getAllByRole('link')).toHaveLength(4))
  })

  it('keeps the results it has when a next page fails, says so, and tries that page again', async () => {
    let failures = 0
    const { user } = renderScreen('/search?q=the', {
      wrap: (dataSource) => ({
        ...twoAtATime(dataSource),
        listDocuments: (request) => {
          if (request?.params.query?.cursor !== undefined && failures++ === 0) return Promise.reject(unavailable())
          return twoAtATime(dataSource).listDocuments(request)
        },
      }),
    })
    await user.click(await within(main()).findByRole('button', { name: 'Load more' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load more results.")
    expect(within(main()).getAllByRole('link')).toHaveLength(2)
    expect(countLine()).toHaveTextContent(/^2 or more results$/)

    await user.click(within(main()).getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(within(main()).getAllByRole('link')).toHaveLength(4))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('the results in Spanish', () => {
  it('say what they search in, count in Spanish and mark the word with its accent', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/search?q=decisión')

    expect(
      await within(main()).findByRole('link', { name: 'Actualización semanal — 13 de octubre' }),
    ).toBeInTheDocument()
    const field = within(main()).getByRole('searchbox', { name: 'Buscar documentos' })
    expect(field).toHaveAccessibleDescription('Busca en los títulos y en las primeras líneas de cada documento.')
    await waitFor(() => expect(countLine()).toHaveTextContent(/^1 resultado$/))
    expect(within(main()).getAllByRole('mark')[0]).toHaveTextContent('decisión')
  })

  it('say there is nothing, and where else to look', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/search?q=zzzz')

    expect(await screen.findByText('Sin resultados para «zzzz»')).toBeInTheDocument()
    expect(
      screen.getByText('Prueba con otra palabra, o abre una carpeta desde Documentos y busca dentro de ella.'),
    ).toBeInTheDocument()
  })
})
