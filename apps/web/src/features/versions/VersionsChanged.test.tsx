import { documentName } from '@draftroom/contract/collab'
import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { launchPlan, openVersions } from './testing/openVersions.tsx'

const versionsKey = ['documents', launchPlan.id, 'versions']

// The event arrives over the connection of the editor, which the history does not open (it is a screen about other
// versions, not about the live text): so what is pinned is that someone who goes back to the editor, and later to the
// history, finds the list read again, not the one they left.
describe('the list of versions when the versions change while the editor is open', () => {
  it('is marked stale by the versions-changed event, so the history reads it again when it is opened', async () => {
    const { user, server, queryClient } = await openVersions()
    expect(queryClient.getQueryState(versionsKey)?.isInvalidated).toBe(false)
    await user.click(screen.getByRole('link', { name: /^Back to/ }))
    await screen.findByRole('textbox', { name: 'Document content' })
    await waitFor(() => expect(server.collaboration.connectionsTo(documentName(launchPlan.id))).toBe(1))

    act(() => server.collaboration.broadcast(documentName(launchPlan.id), { type: 'versions-changed' }))

    await waitFor(() => expect(queryClient.getQueryState(versionsKey)?.isInvalidated).toBe(true))
  })
})
