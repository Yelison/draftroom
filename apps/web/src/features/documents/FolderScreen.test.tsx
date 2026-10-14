import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../data/errors.ts'
import { fixtures, renderScreen, workspaceFixtures } from './testing/renderScreen.tsx'

const { productFolder, ideasFolder } = workspaceFixtures
const main = () => screen.getByRole('main')
const folderPath = (id: string) => `/folders/${id}`

describe('the folder screen', () => {
  it('is headed by the name of the folder and lists its documents, and only those', async () => {
    renderScreen(folderPath(productFolder.id))

    expect(await screen.findByRole('heading', { level: 1, name: 'Product' })).toBeInTheDocument()
    const links = await within(main()).findAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Autumn launch plan', 'Notas de la revisión de diseño'])
  })

  it('does not list an archived document of the folder', async () => {
    renderScreen(folderPath(productFolder.id))

    await screen.findByRole('link', { name: 'Autumn launch plan' })
    expect(screen.queryByRole('link', { name: 'Old pricing draft' })).not.toBeInTheDocument()
  })

  it('keeps the headline, and the focus on it, from the loading state to the folder', async () => {
    const { router } = renderScreen('/shared')
    await screen.findByRole('heading', { level: 1, name: 'Shared' })

    await act(() => router.navigate(folderPath(productFolder.id)))

    const title = await screen.findByRole('heading', { level: 1 })
    expect(title).toHaveFocus()
    await screen.findByRole('heading', { level: 1, name: 'Product' })
    await screen.findByRole('link', { name: 'Autumn launch plan' })
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })

  it('shows cards while it loads, with a spoken status', async () => {
    let arrive: (() => void) | undefined
    renderScreen(folderPath(productFolder.id), {
      wrap: (dataSource) => ({
        ...dataSource,
        listFolders: (request) => new Promise((resolve) => (arrive = () => resolve(dataSource.listFolders(request)))),
      }),
    })

    expect(await within(main()).findByRole('status')).toHaveTextContent('Loading documents')

    // The call may not have been made yet: the workspace is read first.
    await waitFor(() => expect(arrive).toBeDefined())
    await act(async () => arrive?.())
    expect(await screen.findByRole('heading', { level: 1, name: 'Product' })).toBeInTheDocument()
  })

  it('says the folder is empty, and offers to create a document in it', async () => {
    renderScreen(folderPath(ideasFolder.id))

    expect(await screen.findByText('This folder is empty')).toBeInTheDocument()
    expect(within(main()).getAllByRole('button', { name: 'New document' })).toHaveLength(2)
  })

  it('creates the document in the folder', async () => {
    const bodies: unknown[] = []
    const { user, router } = renderScreen(folderPath(ideasFolder.id), {
      wrap: (dataSource) => ({
        ...dataSource,
        createDocument: (request) => {
          bodies.push(request.body)
          return dataSource.createDocument(request)
        },
      }),
    })
    await screen.findByText('This folder is empty')

    await user.click(within(main()).getAllByRole('button', { name: 'New document' })[0] as HTMLElement)

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/documents\//))
    expect(bodies).toEqual([{ title: 'Untitled document', folderId: ideasFolder.id }])
  })

  it('says the folder is not available when it is not there, whatever the reason', async () => {
    renderScreen(folderPath('00000000-0000-4000-8000-0000000000ff'))

    expect(await screen.findByRole('heading', { level: 1, name: "This folder isn't available" })).toBeInTheDocument()
    expect(within(main()).getByRole('link', { name: 'Go to Documents' })).toHaveAttribute('href', '/documents')
  })

  it('says it could not load, and loads again when asked to', async () => {
    let fail = true
    const { user } = renderScreen(folderPath(productFolder.id), {
      wrap: (dataSource) => ({
        ...dataSource,
        listFolders: async (request) => {
          if (fail) throw new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })
          return dataSource.listFolders(request)
        },
      }),
    })

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load your documents")

    fail = false
    await user.click(within(main()).getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Product' })).toBeInTheDocument()
  })

  it('says nothing matches a search inside the folder', async () => {
    const { user } = renderScreen(folderPath(productFolder.id))
    await screen.findByRole('link', { name: 'Autumn launch plan' })

    await user.type(within(main()).getByRole('searchbox', { name: 'Search documents' }), 'zzzz')

    expect(await screen.findByText('No results for “zzzz”')).toBeInTheDocument()
  })

  it('searches only the documents of the folder', async () => {
    const { user } = renderScreen(folderPath(productFolder.id))
    await screen.findByRole('link', { name: 'Autumn launch plan' })

    // "weekly" is the title of a document that is in no folder.
    await user.type(within(main()).getByRole('searchbox', { name: 'Search documents' }), 'weekly')

    expect(await screen.findByText('No results for “weekly”')).toBeInTheDocument()
    expect(fixtures.weeklyEnglish.folderId).toBeNull()
  })
})
