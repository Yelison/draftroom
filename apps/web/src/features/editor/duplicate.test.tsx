import { documentName } from '@draftroom/contract/collab'
import { QueryClient } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { ApiError } from '../../data/errors.ts'
import { keysAfterMutation } from '../../data/queryKeys.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { launchPlan, openEditor, people } from './testing/renderEditor.tsx'

afterEach(() => vi.restoreAllMocks())

const wireName = documentName(launchPlan.id)
const duplicate = /Duplicate as a new document|Duplicar como documento nuevo/

/** The document is open and has stored text when the server tells this connection that it is too large to keep editing. */
async function openTooLarge(options: Parameters<typeof openEditor>[0] = {}) {
  const opened = await openEditor(options)
  act(() => opened.editor.commands.insertContent('Stored text'))
  await waitFor(
    () =>
      expect(screen.getByText(/^(Sync status: Synced|Estado de la sincronización: Sincronizado)$/)).toBeInTheDocument(),
    {
      timeout: 5000,
    },
  )
  act(() => opened.server.collaboration.closeConnections(4413, 'document-too-large'))
  await screen.findByRole('button', { name: duplicate })
  return opened
}

describe('duplicating a document that is too large to keep editing', () => {
  it('opens a new document with the same text, titled for the copy, and puts the focus on its title', async () => {
    const { user, router } = await openTooLarge()

    await user.click(screen.getByRole('button', { name: 'Duplicate as a new document' }))

    await waitFor(() => expect(router.state.location.pathname).not.toBe(`/documents/${launchPlan.id}`))
    const title = await screen.findByRole('heading', { level: 1, name: 'Copy of “Autumn launch plan”' })
    await waitFor(() => expect(title).toHaveFocus())
    expect(await screen.findByRole('textbox', { name: 'Document content' })).toHaveTextContent('Stored text')
    expect(screen.queryAllByText('This document is too large to keep editing')).toHaveLength(0)
  })

  it('leaves the original as it was, and open to read', async () => {
    const { user, router, server } = await openTooLarge()
    const reader = server.connect({ signedInAs: people.marta })
    const before = await reader.getDocument({ params: { path: { documentId: launchPlan.id } } })

    await user.click(screen.getByRole('button', { name: 'Duplicate as a new document' }))
    await waitFor(() => expect(router.state.location.pathname).not.toBe(`/documents/${launchPlan.id}`))

    expect(await reader.getDocument({ params: { path: { documentId: launchPlan.id } } })).toEqual(before)
    await act(() => router.navigate(`/documents/${launchPlan.id}`))
    expect(await screen.findByRole('textbox', { name: 'Document content' })).toHaveTextContent('Stored text')
  })

  it('names the copy in Spanish for a person who reads Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    const { user, router } = await openTooLarge()

    await user.click(screen.getByRole('button', { name: 'Duplicar como documento nuevo' }))

    await waitFor(() => expect(router.state.location.pathname).not.toBe(`/documents/${launchPlan.id}`))
    expect(await screen.findByRole('heading', { level: 1, name: 'Copia de «Autumn launch plan»' })).toBeInTheDocument()
  })

  it('marks stale exactly the queries the table of the API names for it', async () => {
    const { user, router } = await openTooLarge()
    const refreshed = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    refreshed.mockClear()

    await user.click(screen.getByRole('button', { name: 'Duplicate as a new document' }))

    await waitFor(() => expect(router.state.location.pathname).not.toBe(`/documents/${launchPlan.id}`))
    const copyId = router.state.location.pathname.split('/').at(-1) ?? ''
    const expected = keysAfterMutation('duplicateDocument', { workspaceId: launchPlan.workspaceId, documentId: copyId })
    expect(refreshed.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(expected)
  })

  it('says it is working, and sends one request however many times it is pressed', async () => {
    let release: () => void = () => undefined
    const duplicateDocument = vi.fn<DataSource['duplicateDocument']>()
    const { user, router } = await openTooLarge({
      wrap: (dataSource) => ({
        ...dataSource,
        duplicateDocument: (request) => {
          duplicateDocument(request)
          return new Promise((resolve) => {
            release = () => resolve(dataSource.duplicateDocument(request))
          })
        },
      }),
    })

    await user.click(screen.getByRole('button', { name: 'Duplicate as a new document' }))
    const working = await screen.findByRole('button', { name: 'Duplicating…' })
    await user.click(working)
    expect(working).toHaveAttribute('aria-busy', 'true')
    act(() => release())

    await waitFor(() => expect(router.state.location.pathname).not.toBe(`/documents/${launchPlan.id}`))
    expect(duplicateDocument).toHaveBeenCalledTimes(1)
  })

  it('tells the person when the server refused, in a region that was already there, and lets them try again', async () => {
    const refusal = new ApiError({
      type: '/problems/internal-error',
      title: 'Something went wrong.',
      status: 500,
      code: 'internal-error',
    })
    let refuse = true
    const { user, router } = await openTooLarge({
      wrap: (dataSource) => ({
        ...dataSource,
        duplicateDocument: (request) => (refuse ? Promise.reject(refusal) : dataSource.duplicateDocument(request)),
      }),
    })
    const regions = within(screen.getByRole('main')).getAllByRole('status')

    await user.click(screen.getByRole('button', { name: 'Duplicate as a new document' }))

    expect(await screen.findAllByText('Something went wrong. Try again.')).toHaveLength(2)
    expect(
      regions.some((region) => region.isConnected && region.textContent === 'Something went wrong. Try again.'),
    ).toBe(true)
    expect(router.state.location.pathname).toBe(`/documents/${launchPlan.id}`)
    refuse = false
    await user.click(screen.getByRole('button', { name: 'Duplicate as a new document' }))
    await waitFor(() => expect(router.state.location.pathname).not.toBe(`/documents/${launchPlan.id}`))
  })

  it('says a copy that cannot be made is not worth trying again, when the stored state is one the editor cannot read', async () => {
    const { user, router } = await openTooLarge({
      wrap: (dataSource) => ({
        ...dataSource,
        duplicateDocument: () =>
          Promise.reject(
            new ApiError({
              type: '/problems/conflict',
              title: 'The request conflicts with the current state.',
              status: 409,
              code: 'conflict',
            }),
          ),
      }),
    })

    await user.click(screen.getByRole('button', { name: 'Duplicate as a new document' }))

    expect(await screen.findAllByText("This document can't be copied.")).toHaveLength(2)
    expect(screen.queryByText('Something went wrong. Try again.')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/documents/${launchPlan.id}`)
  })

  it('is not offered when the connection stopped for another reason', async () => {
    const { server } = await openEditor()
    await screen.findByText('Sync status: Synced')
    act(() => server.collaboration.closeConnections(4401, 'unauthenticated'))

    await screen.findByRole('button', { name: 'Try again' })

    expect(screen.queryByRole('button', { name: duplicate })).not.toBeInTheDocument()
    expect(server.collaboration.connectionsTo(wireName)).toBe(0)
  })
})
