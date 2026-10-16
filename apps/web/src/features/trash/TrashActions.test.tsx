import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { keysAfterMutation } from '../../data/queryKeys.ts'
import { workspaceFixtures } from '../documents/testing/renderScreen.tsx'
import { answer, archived, main, openTrash, rowButton, spoken } from './testing/openTrash.tsx'

const workspaceId = workspaceFixtures.harborPine.id
const { first, second } = archived
const deletionDialog = (title: string) => screen.findByRole('dialog', { name: `Delete “${title}” permanently?` })

/** A call that answers when the test says so, to look at the screen while the server is still thinking. */
function held<Name extends 'restoreDocument' | 'deleteDocument'>(name: Name) {
  const answers = new Map<string, () => void>()
  const wrap = (dataSource: DataSource): DataSource => ({
    ...dataSource,
    [name]: (request: Parameters<DataSource[Name]>[0]) =>
      new Promise((resolve) => {
        const id = (request as { params: { path: { documentId: string } } }).params.path.documentId
        answers.set(id, () => resolve((dataSource[name] as (request: unknown) => Promise<unknown>)(request)))
      }),
  })
  return { wrap, answer: (id: string) => act(async () => answers.get(id)?.()) }
}

/** Watches one call without changing what it does. */
function watching<Name extends 'restoreDocument' | 'deleteDocument'>(name: Name) {
  const calls = vi.fn()
  const wrap = (dataSource: DataSource): DataSource => ({
    ...dataSource,
    [name]: (request: Parameters<DataSource[Name]>[0]) => {
      calls(request)
      return (dataSource[name] as (request: unknown) => Promise<unknown>)(request)
    },
  })
  return { calls, wrap }
}

describe('restoring a document', () => {
  it('restores it at once, without asking, and the document leaves the trash', async () => {
    const { calls, wrap } = watching('restoreDocument')
    const { user } = await openTrash({ wrap })

    await user.click(rowButton('Restore', second.title))

    await waitFor(() => expect(within(main()).queryByText(second.title)).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls).toHaveBeenCalledWith({ params: { path: { documentId: second.id } } })
    expect(within(main()).getByText(first.title)).toBeInTheDocument()
  })

  it('marks stale exactly what the table of the contract says', async () => {
    const { user, invalidatedKeys } = await openTrash()

    await user.click(rowButton('Restore', second.title))

    await waitFor(() =>
      expect(invalidatedKeys()).toEqual(keysAfterMutation('restoreDocument', { workspaceId, documentId: second.id })),
    )
  })

  it('says it was restored in a live region', async () => {
    const { user } = await openTrash()

    await user.click(rowButton('Restore', second.title))

    await waitFor(() => expect(spoken()).toContain(`“${second.title}” was restored.`))
  })

  it('moves the focus to the row that takes its place', async () => {
    const { user } = await openTrash()

    await user.click(rowButton('Restore', first.title))

    await waitFor(() => expect(rowButton('Restore', second.title)).toHaveFocus())
  })

  it('moves the focus to the row before it when it was the last', async () => {
    const { user } = await openTrash()
    // Two rows: the last is the one to restore, and the one that stays is above it.
    await user.click(rowButton('Restore', second.title))

    await waitFor(() => expect(rowButton('Restore', first.title)).toHaveFocus())
  })

  it('moves the focus to the headline when the trash is left empty', async () => {
    const { user } = await openTrash()
    await user.click(rowButton('Restore', second.title))
    await waitFor(() => expect(rowButton('Restore', first.title)).toHaveFocus())

    await user.click(rowButton('Restore', first.title))

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Trash' })).toHaveFocus())
    expect(within(main()).getByText('The trash is empty')).toBeInTheDocument()
  })

  it('says why it could not, in the language of the person, and keeps the document', async () => {
    const { user } = await openTrash({
      wrap: (dataSource) => ({ ...dataSource, restoreDocument: () => Promise.reject(answer(403, 'forbidden')) }),
    })

    await user.click(rowButton('Restore', second.title))

    expect(await within(main()).findByRole('alert')).toHaveTextContent("You don't have permission to do that.")
    expect(within(main()).getByText(second.title)).toBeInTheDocument()
  })

  it('explains that someone else deleted it first, and reads the list again', async () => {
    const { user, invalidatedKeys } = await openTrash({
      wrap: (dataSource) => ({
        ...dataSource,
        restoreDocument: async (request) => {
          await dataSource.deleteDocument(request)
          return dataSource.restoreDocument(request)
        },
      }),
    })

    await user.click(rowButton('Restore', second.title))

    expect(await within(main()).findByRole('alert')).toHaveTextContent(
      `“${second.title}” isn't in the trash any more: someone else restored or deleted it.`,
    )
    await waitFor(() => expect(within(main()).queryByText(second.title)).not.toBeInTheDocument())
    expect(invalidatedKeys()).toEqual(keysAfterMutation('restoreDocument', { workspaceId, documentId: second.id }))
  })
})

describe('restoring two documents at once', () => {
  it('says each was restored, and keeps each row busy until its own answer', async () => {
    const { wrap, answer } = held('restoreDocument')
    const { user } = await openTrash({ wrap })
    await user.click(rowButton('Restore', first.title))
    await user.click(rowButton('Restore', second.title))
    expect(rowButton('Restore', first.title)).toHaveAttribute('aria-busy', 'true')
    expect(rowButton('Restore', second.title)).toHaveAttribute('aria-busy', 'true')

    // The first answer comes while the second is still on its way.
    await answer(first.id)
    await waitFor(() => expect(spoken()).toContain(`“${first.title}” was restored.`))
    await waitFor(() => expect(within(main()).queryByText(first.title)).not.toBeInTheDocument())
    expect(rowButton('Restore', second.title)).toHaveAttribute('aria-busy', 'true')

    await answer(second.id)
    await waitFor(() => expect(spoken()).toContain(`“${second.title}” was restored.`))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Trash' })).toHaveFocus())
  })

  it('does not let a row that is being restored be deleted', async () => {
    const { wrap } = held('restoreDocument')
    const { user } = await openTrash({ wrap })

    await user.click(rowButton('Restore', second.title))

    expect(rowButton('Delete', second.title)).toBeDisabled()
    expect(rowButton('Delete', first.title)).toBeEnabled()
  })
})

describe('deleting a document for good', () => {
  it('cannot be closed while the deletion is on its way, and says what happened when it answers', async () => {
    const { wrap, answer } = held('deleteDocument')
    const { user } = await openTrash({ wrap })
    await user.click(rowButton('Delete', first.title))
    const dialog = await deletionDialog(first.title)
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))

    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.getByRole('dialog', { name: `Delete “${first.title}” permanently?` })).toBeInTheDocument()

    await answer(first.id)

    await waitFor(() => expect(spoken()).toContain(`“${first.title}” was deleted permanently.`))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(rowButton('Restore', second.title)).toHaveFocus())
  })

  it('asks first, naming the document and saying that it cannot be undone', async () => {
    const { user } = await openTrash()

    await user.click(rowButton('Delete', second.title))

    const dialog = await deletionDialog(second.title)
    expect(dialog).toHaveAccessibleDescription(/This can't be undone\./)
  })

  it('keeps the document when the person cancels, and puts the focus back on the button that opened the dialog', async () => {
    const { calls, wrap } = watching('deleteDocument')
    const { user } = await openTrash({ wrap })
    await user.click(rowButton('Delete', second.title))

    await user.click(within(await deletionDialog(second.title)).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls).not.toHaveBeenCalled()
    expect(within(main()).getByText(second.title)).toBeInTheDocument()
    expect(rowButton('Delete', second.title)).toHaveFocus()
  })

  it('deletes it when the person confirms, and the document leaves the trash', async () => {
    const { calls, wrap } = watching('deleteDocument')
    const { user } = await openTrash({ wrap })
    await user.click(rowButton('Delete', second.title))

    await user.click(within(await deletionDialog(second.title)).getByRole('button', { name: 'Delete permanently' }))

    await waitFor(() => expect(within(main()).queryByText(second.title)).not.toBeInTheDocument())
    expect(calls).toHaveBeenCalledWith({ params: { path: { documentId: second.id } } })
  })

  it('marks stale exactly what the table of the contract says', async () => {
    const { user, invalidatedKeys } = await openTrash()
    await user.click(rowButton('Delete', second.title))

    await user.click(within(await deletionDialog(second.title)).getByRole('button', { name: 'Delete permanently' }))

    await waitFor(() =>
      expect(invalidatedKeys()).toEqual(keysAfterMutation('deleteDocument', { workspaceId, documentId: second.id })),
    )
  })

  it('says it was deleted in a live region, and the focus goes to the row that takes its place', async () => {
    const { user } = await openTrash()
    await user.click(rowButton('Delete', first.title))

    await user.click(within(await deletionDialog(first.title)).getByRole('button', { name: 'Delete permanently' }))

    await waitFor(() => expect(spoken()).toContain(`“${first.title}” was deleted permanently.`))
    await waitFor(() => expect(rowButton('Restore', second.title)).toHaveFocus())
  })

  it('says why it could not, inside the dialog, and keeps the document and the dialog', async () => {
    const { user } = await openTrash({
      wrap: (dataSource) => ({ ...dataSource, deleteDocument: () => Promise.reject(answer(503, 'unavailable')) }),
    })
    await user.click(rowButton('Delete', second.title))
    const dialog = await deletionDialog(second.title)

    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Draftroom is unavailable right now.')
    expect(within(main()).getByText(second.title)).toBeInTheDocument()
  })

  it.each([
    {
      case: 'someone restored it first (409: it is not archived any more)',
      before: (dataSource: DataSource, request: Parameters<DataSource['deleteDocument']>[0]) =>
        dataSource.restoreDocument(request),
    },
    {
      case: 'someone deleted it first (404)',
      before: (dataSource: DataSource, request: Parameters<DataSource['deleteDocument']>[0]) =>
        dataSource.deleteDocument(request),
    },
  ])('explains it, closes the dialog and reads the list again when $case', async ({ before }) => {
    const { user, invalidatedKeys } = await openTrash({
      wrap: (dataSource) => ({
        ...dataSource,
        deleteDocument: async (request) => {
          await before(dataSource, request)
          return dataSource.deleteDocument(request)
        },
      }),
    })
    await user.click(rowButton('Delete', second.title))

    await user.click(within(await deletionDialog(second.title)).getByRole('button', { name: 'Delete permanently' }))

    expect(await within(main()).findByRole('alert')).toHaveTextContent(
      `“${second.title}” isn't in the trash any more: someone else restored or deleted it.`,
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(within(main()).queryByText(second.title)).not.toBeInTheDocument())
    expect(invalidatedKeys()).toEqual(keysAfterMutation('deleteDocument', { workspaceId, documentId: second.id }))
    expect(rowButton('Restore', first.title)).toHaveFocus()
  })
})
