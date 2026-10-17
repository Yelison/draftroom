import { documentName } from '@draftroom/contract/collab'
import { focusManager, onlineManager } from '@tanstack/react-query'
import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copiesOf } from '../../collab/offlineCache.ts'
import type { DataSource } from '../../data/DataSource.ts'
import { ApiError } from '../../data/errors.ts'
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
  let refusals = 0
  return {
    wrap: (dataSource: DataSource): DataSource => ({
      ...dataSource,
      getDocument: async (request) => {
        const { refusal } = answers
        if (refusal === null) return dataSource.getDocument(request)
        if (answers.held) await new Promise<void>((resolve) => waiting.push(resolve))
        refusals += 1
        throw refusal
      },
    }),
    /** From now on the API refuses the document with this status; held, until `answer`, when the test needs the connection first. */
    refuse(status: 403 | 404 | 503, { held = false } = {}) {
      const code = { 403: 'forbidden', 404: 'not-found', 503: 'unavailable' } as const
      answers.refusal = new ApiError({ type: 'about:blank', title: 'Refused', status, code: code[status] })
      answers.held = held
    },
    answer: () => act(async () => waiting.splice(0).forEach((resolve) => resolve())),
    refusals: () => refusals,
  }
}

/** The window gets its focus back, which is what makes the screen read the document again. */
function readAgain() {
  act(() => focusManager.setFocused(false))
  act(() => focusManager.setFocused(true))
}

const copiesOnDevice = () => copiesOf(marta.id)

describe('access removed while the person was offline, when the API answers before the connection', () => {
  it.each([
    { status: 404, answer: 'not found' },
    { status: 403, answer: 'forbidden' },
  ] as const)(
    'purges the copy, says so, and sends nothing of what was written, after a $answer',
    async ({ status }) => {
      const api = documentApi()
      const { editor, server } = await openEditor({ wrap: api.wrap })
      await waitFor(() => expect(screen.getByText('Sync status: Synced')).toBeInTheDocument())
      const comeBack = goOffline()
      act(() => editor.commands.insertContent('Written offline'))
      await waitFor(() => expect(screen.getByText('Sync status: Offline with local copy')).toBeInTheDocument())
      expect(await copiesOnDevice()).toHaveLength(1)

      // The connection is not answered until the API has: the refusal of the document is what the screen sees first.
      server.collaboration.holdAuthentication()
      api.refuse(status)
      comeBack()

      expect(await screen.findByRole('heading', { name: removedHeading })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Go to Documents' })).toHaveAttribute('href', '/documents')
      // The text that may have had the focus is gone: the focus goes to the headline and not to the page.
      expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
      expect(screen.queryByRole('heading', { name: "This document isn't available" })).not.toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'Document content' })).not.toBeInTheDocument()
      await waitFor(async () => expect(await copiesOnDevice()).toEqual([]))

      // The connection is let through now, and what the person wrote does not go with it.
      await act(async () => server.collaboration.releaseAuthentication())
      await act(async () => new Promise((resolve) => setTimeout(resolve, 200)))
      expect(server.collaboration.document(wireName).getXmlFragment('default').toString()).not.toContain(
        'Written offline',
      )
      expect(server.collaboration.connectionsTo(wireName)).toBe(0)
    },
  )

  it('keeps the copy when the API fails for a reason that is not about access', async () => {
    const api = documentApi()
    const { editor } = await openEditor({ wrap: api.wrap })
    await waitFor(() => expect(screen.getByText('Sync status: Synced')).toBeInTheDocument())
    const comeBack = goOffline()
    act(() => editor.commands.insertContent('Written offline'))
    await waitFor(() => expect(screen.getByText('Sync status: Offline with local copy')).toBeInTheDocument())

    api.refuse(503)
    comeBack()

    expect(await screen.findByRole('heading', { name: "We couldn't open this document" })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: removedHeading })).not.toBeInTheDocument()
    expect(await copiesOnDevice()).toHaveLength(1)
  })
})

describe('access removed while the document is open, when the connection answers before the API', () => {
  it('keeps saying that the access was removed when the API refuses the document afterwards', async () => {
    const api = documentApi()
    const { server } = await openEditor({ wrap: api.wrap })
    await waitFor(() => expect(server.collaboration.connectionsTo(wireName)).toBe(1))
    api.refuse(404, { held: true })
    readAgain()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Autumn launch plan' })).toBeInTheDocument())

    act(() => server.collaboration.closeConnections(4403, 'access-revoked'))
    expect(await screen.findByRole('heading', { name: removedHeading })).toBeInTheDocument()
    await api.answer()
    await waitFor(() => expect(api.refusals()).toBe(1))
    // The answer has been taken in by the screen once the query has had a turn to report it.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))

    expect(screen.getByRole('heading', { name: removedHeading })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: "This document isn't available" })).not.toBeInTheDocument()
    expect(await copiesOnDevice()).toEqual([])
  })
})
