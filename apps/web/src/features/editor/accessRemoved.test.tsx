import { documentName } from '@draftroom/contract/collab'
import { onlineManager, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { act, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copiesOf } from '../../collab/offlineCache.ts'
import type { DataSource } from '../../data/DataSource.ts'
import { ApiError } from '../../data/errors.ts'
import { queryKeys } from '../../data/queryKeys.ts'
import { SimulatedSocket } from '../../data/mock/collab/SimulatedCollabServer.ts'
import { marta } from '../../data/mock/fixtures/index.ts'
import { launchPlan, openEditor } from './testing/renderEditor.tsx'

afterEach(() => {
  vi.restoreAllMocks()
  // A new page knows nothing of the network the old one lost: its queries start as they would after a reload.
  onlineManager.setOnline(true)
})

const wireName = documentName(launchPlan.id)
const removedHeading = 'Your access to this document was removed'

/** A browser that loses its network says so in both places: the flag and the event. */
function goOffline() {
  const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  act(() => window.dispatchEvent(new Event('offline')))
  return () => {
    onLine.mockReturnValue(true)
    act(() => window.dispatchEvent(new Event('online')))
  }
}

/**
 * What the API answers when the screen reads the document again: the document, until the test says the person lost it,
 * and then the refusal of that kind. It can be held, so that the connection's answer is the one that comes first.
 */
function documentApi() {
  const answers = { refusal: null as ApiError | null, held: false }
  const waiting: Array<() => void> = []
  return {
    wrap: (dataSource: DataSource): DataSource => ({
      ...dataSource,
      getDocument: async (request) => {
        const { refusal } = answers
        if (refusal === null) return dataSource.getDocument(request)
        if (answers.held) await new Promise<void>((resolve) => waiting.push(resolve))
        throw refusal
      },
    }),
    /** From now on the API refuses the document with this status; held, until `answer`, when the test needs the connection first. */
    refuse(status: 403 | 404 | 503, { held = false } = {}) {
      const code = { 403: 'forbidden', 404: 'not-found', 503: 'unavailable' } as const
      answers.refusal = new ApiError({ type: 'about:blank', title: 'Refused', status, code: code[status] })
      answers.held = held
    },
    /** How many requests are being held back. */
    held: () => waiting.length,
    /** Lets the held requests through, and holds none of the ones that come later. */
    answer: () => {
      answers.held = false
      return act(async () => waiting.splice(0).forEach((resolve) => resolve()))
    },
  }
}

/**
 * The screen reads the document again, as it does when something invalidates it (an event of the connection, a change of
 * the document). The trigger is explicit and not the window's focus, which these tests do not test: it is the answer of the
 * screen to the API's refusal that they pin.
 */
const onScreen: { queryClient: QueryClient | null } = { queryClient: null }
function readAgain() {
  const { queryClient } = onScreen
  if (queryClient === null) throw new Error('The document query is not on screen')
  act(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.document(launchPlan.id) })
  })
}

const copiesOnDevice = () => copiesOf(marta.id)

/**
 * No read of the document is on its way and the last one worked. One that is would take in the next read the screen makes
 * (React Query joins them) and answer it with what the API said before the test changed it.
 */
const readFully = () => waitFor(() => expect(screen.getByLabelText('Document query')).toHaveTextContent('success idle'))

/** The sockets of the simulated server that the session has used, whether they are open or not. */
function usedSockets() {
  const listening = vi.spyOn(SimulatedSocket.prototype, 'addEventListener')
  return () => [...new Set(listening.mock.contexts)]
}
const CLOSED = 3

/**
 * What the document's query says it is, in the page: it is told in the same turn as the screen is, so that a test that
 * waits for `error` here has the screen's answer to it and not only the cache's.
 */
function DocumentQueryStatus() {
  const queryClient = useQueryClient()
  useEffect(() => {
    onScreen.queryClient = queryClient
    return () => {
      onScreen.queryClient = null
    }
  }, [queryClient])
  const { status, fetchStatus } = useQuery({ queryKey: queryKeys.document(launchPlan.id), enabled: false })
  return <output aria-label="Document query">{`${status} ${fetchStatus}`}</output>
}

describe('access removed while the person was offline, when the API answers before the connection', () => {
  it('purges the copy, says so, and sends nothing of what was written, after a not found', async () => {
    const api = documentApi()
    const sockets = usedSockets()
    const { editor, server } = await openEditor({ wrap: api.wrap, extra: <DocumentQueryStatus /> })
    await waitFor(() => expect(screen.getByText('Sync status: Synced')).toBeInTheDocument())
    const comeBack = goOffline()
    act(() => editor.commands.insertContent('Written offline'))
    await waitFor(() => expect(screen.getByText('Sync status: Offline with local copy')).toBeInTheDocument())
    expect(await copiesOnDevice()).toHaveLength(1)

    // The connection is not answered until the API has: the refusal of the document is what the screen sees first.
    server.collaboration.holdAuthentication()
    await readFully()
    api.refuse(404)
    comeBack()
    readAgain()

    expect(await screen.findByRole('heading', { name: removedHeading })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Documents' })).toHaveAttribute('href', '/documents')
    // The text that may have had the focus is gone: the focus goes to the headline and not to the page.
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    expect(screen.queryByRole('heading', { name: "This document isn't available" })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Document content' })).not.toBeInTheDocument()
    await waitFor(async () => expect(await copiesOnDevice()).toEqual([]))

    // The connection is let through now, and what the person wrote does not go with it.
    // The session has closed the connection that was waiting to be answered: that is what is waited for, not a time.
    await waitFor(() =>
      expect(sockets().every((socket) => socket instanceof SimulatedSocket && socket.readyState === CLOSED)).toBe(true),
    )
    await act(async () => server.collaboration.releaseAuthentication())
    expect(server.collaboration.document(wireName).getXmlFragment('default').toString()).not.toContain(
      'Written offline',
    )
    expect(server.collaboration.connectionsTo(wireName)).toBe(0)
  })

  it.each([
    { status: 503, answer: 'is unavailable' },
    { status: 403, answer: 'forbids something, which is not that the person lost the document' },
  ] as const)('keeps the copy when the API $answer', async ({ status }) => {
    const api = documentApi()
    const { editor } = await openEditor({ wrap: api.wrap, extra: <DocumentQueryStatus /> })
    await waitFor(() => expect(screen.getByText('Sync status: Synced')).toBeInTheDocument())
    const comeBack = goOffline()
    act(() => editor.commands.insertContent('Written offline'))
    await waitFor(() => expect(screen.getByText('Sync status: Offline with local copy')).toBeInTheDocument())

    await readFully()
    api.refuse(status)
    comeBack()
    readAgain()

    expect(await screen.findByRole('heading', { name: "We couldn't open this document" })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: removedHeading })).not.toBeInTheDocument()
    expect(await copiesOnDevice()).toHaveLength(1)
  })
})

describe('access removed while the document is open, when the connection answers before the API', () => {
  it('keeps saying that the access was removed when the API refuses the document afterwards', async () => {
    const api = documentApi()
    const { server } = await openEditor({ wrap: api.wrap, extra: <DocumentQueryStatus /> })
    await waitFor(() => expect(server.collaboration.connectionsTo(wireName)).toBe(1))
    await readFully()
    api.refuse(404, { held: true })
    readAgain()
    await waitFor(() => expect(api.held()).toBe(1))

    act(() => server.collaboration.closeConnections(4403, 'access-revoked'))
    expect(await screen.findByRole('heading', { name: removedHeading })).toBeInTheDocument()
    await api.answer()
    // The query has failed with the answer, and the screen has been told in the same turn.
    await waitFor(() => expect(screen.getByLabelText('Document query')).toHaveTextContent('error idle'))

    expect(screen.getByRole('heading', { name: removedHeading })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: "This document isn't available" })).not.toBeInTheDocument()
    expect(await copiesOnDevice()).toEqual([])
  })
})
