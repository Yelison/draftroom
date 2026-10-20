import { documentName } from '@draftroom/contract/collab'
import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copiesOf } from '../../collab/offlineCache.ts'
import type { DataSource } from '../../data/DataSource.ts'
import { daniel, marta } from '../../data/mock/fixtures/index.ts'
import { researchFolder } from '../../data/mock/fixtures/workspaces.ts'
import { launchPlan, openEditor, people } from './testing/renderEditor.tsx'

afterEach(() => vi.restoreAllMocks())

// What the people who have the document open see when someone else renames or archives it, as the collaboration
// connection announces it (protocol sections 6.3 and 9). The mock server stands for the real one: the other person's
// change is made through their own data source, and the notice and the close are what the server would send after it.

const wireName = documentName(launchPlan.id)
const title = () => screen.getByRole('textbox', { name: 'Document title' })

/** Counts the times the screen asks for the document, to know when it has read what the notice said changed. */
function countReads() {
  const reads = { count: 0 }
  const wrap = (dataSource: DataSource): DataSource => ({
    ...dataSource,
    getDocument: (request) => {
      reads.count += 1
      return dataSource.getDocument(request)
    },
  })
  return { reads, wrap }
}

describe('a document renamed by someone else', () => {
  it('shows the new title as soon as the connection says so, without a reload', async () => {
    const { server } = await openEditor({ signedInAs: people.daniel })
    const other = server.connect({ signedInAs: people.marta })
    expect(title()).toHaveValue('Autumn launch plan')

    const renamed = await other.updateDocument({
      params: { path: { documentId: launchPlan.id } },
      body: { title: 'Winter launch plan', revision: launchPlan.revision },
    })
    act(() =>
      server.collaboration.broadcast(wireName, {
        type: 'metadata-changed',
        title: renamed.title,
        revision: renamed.revision,
      }),
    )

    await waitFor(() => expect(title()).toHaveValue('Winter launch plan'))
    expect(screen.getByRole('heading', { level: 1, name: 'Winter launch plan' })).toBeInTheDocument()
  })

  it('does not replace what the person is typing in the title, and tells them when they save it', async () => {
    const { reads, wrap } = countReads()
    const { server, user } = await openEditor({ signedInAs: people.daniel, wrap })
    const other = server.connect({ signedInAs: people.marta })
    await user.clear(title())
    await user.type(title(), 'My own title')

    const renamed = await other.updateDocument({
      params: { path: { documentId: launchPlan.id } },
      body: { title: 'Renamed by Marta', revision: launchPlan.revision },
    })
    const readsBefore = reads.count
    act(() =>
      server.collaboration.broadcast(wireName, {
        type: 'metadata-changed',
        title: renamed.title,
        revision: renamed.revision,
      }),
    )
    await waitFor(() => expect(reads.count).toBeGreaterThan(readsBefore))

    // The notice made the screen read the document again, and what is being typed is still what the field shows.
    expect(title()).toHaveValue('My own title')
    await user.tab()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Someone else changed the title. Your text is still here; press Enter to use it instead.',
    )
    expect(title()).toHaveValue('My own title')
    // Nothing was replaced: the title the other person gave it is the one the server still has.
    const stored = await other.getDocument({ params: { path: { documentId: launchPlan.id } } })
    expect(stored.title).toBe('Renamed by Marta')
  })

  it('saves what the person typed without a conflict when the other person only moved the document', async () => {
    const { server, user } = await openEditor({ signedInAs: people.daniel })
    const other = server.connect({ signedInAs: people.marta })
    await user.clear(title())
    await user.type(title(), 'My own title')

    const moved = await other.updateDocument({
      params: { path: { documentId: launchPlan.id } },
      body: { folderId: researchFolder.id, revision: launchPlan.revision },
    })
    act(() =>
      server.collaboration.broadcast(wireName, {
        type: 'metadata-changed',
        title: moved.title,
        revision: moved.revision,
      }),
    )
    await user.tab()

    // Nobody changed the title, so there is nothing to tell: it is saved and the document stays where it was moved to.
    await waitFor(async () =>
      expect(await other.getDocument({ params: { path: { documentId: launchPlan.id } } })).toMatchObject({
        title: 'My own title',
        folderId: researchFolder.id,
      }),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(title()).toHaveValue('My own title')
  })

  it('replaces the other title only when the person asks to, with Enter, now from the revision they were told about', async () => {
    const { server, user } = await openEditor({ signedInAs: people.daniel })
    const other = server.connect({ signedInAs: people.marta })
    await user.clear(title())
    await user.type(title(), 'My own title')
    const renamed = await other.updateDocument({
      params: { path: { documentId: launchPlan.id } },
      body: { title: 'Renamed by Marta', revision: launchPlan.revision },
    })
    act(() =>
      server.collaboration.broadcast(wireName, {
        type: 'metadata-changed',
        title: renamed.title,
        revision: renamed.revision,
      }),
    )
    await user.tab()
    await screen.findByRole('alert')

    await user.click(title())
    await user.keyboard('{Enter}')

    await waitFor(async () =>
      expect((await other.getDocument({ params: { path: { documentId: launchPlan.id } } })).title).toBe('My own title'),
    )
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})

describe('a document archived while it is open', () => {
  it('takes the access from a person who is not an owner: the screen says so and the copy of this device is purged', async () => {
    const { server } = await openEditor({ signedInAs: people.daniel })
    await screen.findByText('Sync status: Synced')
    expect(await copiesOf(daniel.id)).toHaveLength(1)
    const owner = server.connect({ signedInAs: people.marta })

    await owner.archiveDocument({ params: { path: { documentId: launchPlan.id } } })
    act(() => server.collaboration.broadcast(wireName, { type: 'document-archived' }))
    act(() => server.collaboration.closeConnections(4403, 'access-revoked'))

    expect(await screen.findByRole('heading', { name: 'Your access to this document was removed' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Document content' })).not.toBeInTheDocument()
    await waitFor(async () => expect(await copiesOf(daniel.id)).toEqual([]))
  })

  it('leaves the owner the document to read: not editable, with the copy of this device kept', async () => {
    const { server, text } = await openEditor({ signedInAs: people.marta })
    await screen.findByText('Sync status: Synced')
    expect(await copiesOf(marta.id)).toHaveLength(1)
    const owner = server.connect({ signedInAs: people.marta })

    await owner.archiveDocument({ params: { path: { documentId: launchPlan.id } } })
    act(() => server.collaboration.broadcast(wireName, { type: 'document-archived' }))
    act(() => server.collaboration.closeConnections(4409, 'role-changed'))

    await screen.findByText('Sync status: Read-only')
    await waitFor(() => expect(text).toHaveAttribute('contenteditable', 'false'))
    expect(screen.queryByRole('heading', { name: 'Your access to this document was removed' })).not.toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: 'Formatting' })).not.toBeInTheDocument()
    // The server refuses to rename an archived document, so the field does not offer it.
    await waitFor(() => expect(title()).toHaveAttribute('readonly'))
    expect(await copiesOf(marta.id)).toHaveLength(1)
  })
})
