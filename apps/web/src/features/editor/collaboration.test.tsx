import { QueryClient } from '@tanstack/react-query'
import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { documentName, type StatelessEvent } from '@draftroom/contract/collab'
import { keysAfterEvent } from '../../data/queryKeys.ts'
import { daniel } from '../../data/mock/fixtures/index.ts'
import { budget, launchPlan, openEditor, people } from './testing/renderEditor.tsx'
import { joinAsPeer } from './testing/peer.ts'

afterEach(() => vi.restoreAllMocks())

type ChangeEvent = Exclude<StatelessEvent['type'], 'stored' | 'document-too-large'>

const wireName = documentName(launchPlan.id)
const threadId = '3f6b1c2a-0000-4000-8000-0000000000aa'

describe('what other people change while the document is open', () => {
  const changes: { event: StatelessEvent }[] = [
    { event: { type: 'metadata-changed', title: 'New title', revision: 9 } },
    { event: { type: 'access-changed' } },
    { event: { type: 'comments-changed', threadId } },
    { event: { type: 'versions-changed' } },
    { event: { type: 'document-archived' } },
  ]

  it.each(changes)('$event.type refreshes exactly the queries the protocol names for it', async ({ event }) => {
    const refreshed = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    const { server } = await openEditor()
    await waitFor(() => expect(server.collaboration.connectionsTo(wireName)).toBe(1))
    refreshed.mockClear()

    act(() => server.collaboration.broadcast(wireName, event))

    const expected = keysAfterEvent(event.type as ChangeEvent, {
      workspaceId: launchPlan.workspaceId,
      documentId: launchPlan.id,
    })
    await waitFor(() => expect(refreshed).toHaveBeenCalledTimes(expected.length))
    expect(refreshed.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(expected)
  })

  it('refreshes nothing for the events of the durability protocol', async () => {
    const refreshed = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    const { server, editor } = await openEditor()
    await waitFor(() => expect(server.collaboration.connectionsTo(wireName)).toBe(1))
    refreshed.mockClear()

    act(() => editor.commands.insertContent('hello'))
    await waitFor(() => expect(screen.getByText('Sync status: Synced')).toBeInTheDocument(), { timeout: 5000 })

    expect(refreshed).not.toHaveBeenCalled()
  })
})

describe('the carets of the others', () => {
  it('labels a caret with the name the server holds for that person, whatever their client wrote', async () => {
    const { server, editor, text } = await openEditor()
    const peer = await joinAsPeer({
      server,
      documentId: launchPlan.id,
      person: { id: daniel.id, name: 'Not Daniel At All' },
      serverName: daniel.name ?? daniel.email,
    })
    act(() => editor.commands.insertContent('Hello world'))
    await waitFor(() => expect(peer.editor.getText()).toBe('Hello world'))

    act(() => peer.placeCaret(4))

    const label = await waitFor(() => {
      const found = text.querySelector('.caretLabel')
      expect(found).not.toBeNull()
      return found
    })
    expect(label).toHaveTextContent(daniel.name ?? '')
    expect(label).not.toHaveTextContent('Not Daniel At All')
    peer.leave()
  })

  it('draws the name as text, never as markup', async () => {
    const { server, editor, text } = await openEditor()
    const hostile = '<img src=x onerror=alert(1)>'
    const peer = await joinAsPeer({
      server,
      documentId: launchPlan.id,
      person: { id: daniel.id, name: 'Daniel' },
      serverName: hostile,
    })
    act(() => editor.commands.insertContent('Hello'))
    await waitFor(() => expect(peer.editor.getText()).toBe('Hello'))
    act(() => peer.placeCaret(3))

    await waitFor(() => expect(text.querySelector('.caretLabel')).toHaveTextContent(hostile))
    expect(text.querySelector('img')).toBeNull()
    peer.leave()
  })
})

describe('undo', () => {
  it('reverts only what the person wrote, and leaves what another person wrote', async () => {
    const { server, editor } = await openEditor()
    const peer = await joinAsPeer({ server, documentId: launchPlan.id, person: { id: daniel.id, name: 'Daniel' } })

    act(() => peer.editor.commands.insertContent('Remote. '))
    await waitFor(() => expect(editor.getText()).toBe('Remote. '))
    act(() => editor.commands.insertContent('Local.'))
    await waitFor(() => expect(peer.editor.getText()).toBe('Local.Remote. '))

    act(() => {
      editor.commands.undo()
    })

    await waitFor(() => expect(editor.getText()).toBe('Remote. '))
    await waitFor(() => expect(peer.editor.getText()).toBe('Remote. '))
    // There is nothing of the person's own left to undo, and the other person's text is not theirs to undo.
    act(() => {
      editor.commands.undo()
    })
    expect(editor.getText()).toBe('Remote. ')
    peer.leave()
  })
})

describe('the sync status of the open editor', () => {
  it('announces synchronising once however many keys are pressed, and synced once when the server stored them', async () => {
    const { editor } = await openEditor()
    const region = await screen.findByText('Sync status: Synced')
    const announced: (string | null)[] = []
    const observer = new MutationObserver(() => announced.push(region.textContent))
    observer.observe(region, { childList: true, characterData: true, subtree: true })

    for (let key = 0; key < 30; key += 1) act(() => editor.commands.insertContent('x'))
    await waitFor(() => expect(region).toHaveTextContent('Sync status: Synced'), { timeout: 5000 })
    observer.disconnect()

    expect(announced).toEqual(['Sync status: Synchronising', 'Sync status: Synced'])
  })

  it('says read-only to a reader and never synchronising, whatever the provider counts', async () => {
    const { server } = await openEditor({ signedInAs: people.daniel, documentId: budget.id })

    await screen.findByText('Sync status: Read-only')
    expect(server.collaboration.document(documentName(budget.id)).getXmlFragment('default').length).toBe(0)
  })
})
