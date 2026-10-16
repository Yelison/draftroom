import { onlineManager } from '@tanstack/react-query'
import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { documentName } from '@draftroom/contract/collab'
import { openEditor, launchPlan } from './testing/renderEditor.tsx'

afterEach(() => vi.restoreAllMocks())

const wireName = documentName(launchPlan.id)

/** A browser that loses its network says so in both places: the flag and the event. */
function goOffline() {
  const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  act(() => window.dispatchEvent(new Event('offline')))
  return () => {
    onLine.mockReturnValue(true)
    act(() => window.dispatchEvent(new Event('online')))
  }
}

describe('a document written offline', () => {
  it('is on this device and not called saved, and is still there when the document is opened again without a network', async () => {
    const first = await openEditor()
    await waitFor(() => expect(screen.getByText('Sync status: Synced')).toBeInTheDocument())
    const comeBack = goOffline()

    act(() => first.editor.commands.insertContent('Written offline'))

    await waitFor(() => expect(screen.getByText('Sync status: Offline with local copy')).toBeInTheDocument())
    expect(screen.getByText("You're working offline")).toBeInTheDocument()
    expect(screen.queryByText(/saved/i)).not.toBeInTheDocument()

    // Opened again, as after a reload: a new page, a server that has never heard of the text, and still no network.
    first.unmount()
    // A new page knows nothing of the network the old one lost: its queries start as they would after a reload.
    onlineManager.setOnline(true)
    const again = await openEditor()

    await waitFor(() => expect(again.editor.getText()).toBe('Written offline'))
    expect(screen.getByText('Sync status: Offline with local copy')).toBeInTheDocument()
    expect(again.server.collaboration.connectionsTo(wireName)).toBe(0)

    comeBack()

    await waitFor(() => expect(screen.getByText('Sync status: Synced')).toBeInTheDocument(), { timeout: 5000 })
    expect(again.server.collaboration.document(wireName).getXmlFragment('default').toString()).toContain(
      'Written offline',
    )
    expect(screen.queryByText("You're working offline")).not.toBeInTheDocument()
  })
})
