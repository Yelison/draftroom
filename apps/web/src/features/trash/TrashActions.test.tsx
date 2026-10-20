import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { keysAfterMutation } from '../../data/queryKeys.ts'
import { workspaceFixtures } from '../documents/testing/renderScreen.tsx'
import {
  answer,
  archived,
  fixtures,
  main,
  openTrash,
  panel,
  panelButton,
  queryRow,
  renderScreen,
  row,
  selectedRow,
  spoken,
} from './testing/openTrash.tsx'

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
  it('restores the selected one at once, without asking, and it leaves the trash', async () => {
    const { calls, wrap } = watching('restoreDocument')
    const { user } = await openTrash({ wrap })

    await user.click(panelButton(first.title, 'Restore'))

    await waitFor(() => expect(queryRow(first.title)).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls).toHaveBeenCalledWith({ params: { path: { documentId: first.id } } })
    expect(row(second.title)).toBeInTheDocument()
  })

  it('restores the document that was picked, not the first', async () => {
    const { calls, wrap } = watching('restoreDocument')
    const { user } = await openTrash({ wrap })
    await user.click(row(second.title))

    await user.click(panelButton(second.title, 'Restore'))

    await waitFor(() => expect(queryRow(second.title)).not.toBeInTheDocument())
    expect(calls).toHaveBeenCalledOnce()
    expect(calls).toHaveBeenCalledWith({ params: { path: { documentId: second.id } } })
  })

  it('marks stale exactly what the table of the contract says', async () => {
    const { user, invalidatedKeys } = await openTrash()

    await user.click(panelButton(first.title, 'Restore'))

    await waitFor(() =>
      expect(invalidatedKeys()).toEqual(keysAfterMutation('restoreDocument', { workspaceId, documentId: first.id })),
    )
  })

  it('says it was restored in a live region', async () => {
    const { user } = await openTrash()

    await user.click(panelButton(first.title, 'Restore'))

    await waitFor(() => expect(spoken()).toContain(`“${first.title}” was restored.`))
  })

  it('selects the row that takes its place, shows it in the panel and moves the focus to it', async () => {
    const { user } = await openTrash()

    await user.click(panelButton(first.title, 'Restore'))

    await waitFor(() => expect(row(second.title)).toHaveFocus())
    expect(selectedRow()).toBe(row(second.title))
    expect(panel(second.title)).toBeInTheDocument()
  })

  it('selects the row before it, and gives it the focus, when it was the last', async () => {
    const { user } = await openTrash()
    await user.click(row(second.title))
    await user.click(panelButton(second.title, 'Restore'))

    await waitFor(() => expect(row(first.title)).toHaveFocus())
    expect(selectedRow()).toBe(row(first.title))
  })

  it('moves the focus to the headline when the trash is left empty, and shows it empty with no panel', async () => {
    const { user } = await openTrash()
    await user.click(panelButton(first.title, 'Restore'))
    await waitFor(() => expect(row(second.title)).toHaveFocus())

    await user.click(panelButton(second.title, 'Restore'))

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Trash' })).toHaveFocus())
    expect(within(main()).getByText('The trash is empty')).toBeInTheDocument()
    expect(within(main()).queryByRole('region')).not.toBeInTheDocument()
  })

  it('says why it could not, in the panel and in the language of the person, and keeps the document', async () => {
    const { user } = await openTrash({
      wrap: (dataSource) => ({ ...dataSource, restoreDocument: () => Promise.reject(answer(403, 'forbidden')) }),
    })

    await user.click(panelButton(first.title, 'Restore'))

    const problem = await within(panel(first.title)).findByRole('alert')
    expect(problem).toHaveTextContent("You don't have permission to do that.")
    expect(panelButton(first.title, 'Restore')).toHaveAccessibleDescription("You don't have permission to do that.")
    expect(row(first.title)).toBeInTheDocument()
  })

  it('does not carry the failure to another document when the selection changes', async () => {
    const { user } = await openTrash({
      wrap: (dataSource) => ({ ...dataSource, restoreDocument: () => Promise.reject(answer(403, 'forbidden')) }),
    })
    await user.click(panelButton(first.title, 'Restore'))
    await within(panel(first.title)).findByRole('alert')

    await user.click(row(second.title))

    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
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

    await user.click(panelButton(first.title, 'Restore'))

    expect(await within(main()).findByRole('alert')).toHaveTextContent(
      `“${first.title}” isn't in the trash any more: someone else restored or deleted it.`,
    )
    await waitFor(() => expect(queryRow(first.title)).not.toBeInTheDocument())
    expect(invalidatedKeys()).toEqual(keysAfterMutation('restoreDocument', { workspaceId, documentId: first.id }))
    await waitFor(() => expect(row(second.title)).toHaveFocus())
  })
})

describe('restoring a document while "Load more" is on its way', () => {
  /** Three archived documents in pages of two, with the second page held until the test lets it go. */
  function threeInPagesOfTwo() {
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const wrap = (dataSource: DataSource): DataSource => {
      const archivedThird = dataSource.archiveDocument({ params: { path: { documentId: fixtures.launchPlan.id } } })
      return {
        ...dataSource,
        listDocuments: async (request) => {
          await archivedThird
          if (request?.params.query?.cursor !== undefined) await held
          return dataSource.listDocuments({
            params: {
              path: { workspaceId: request?.params.path.workspaceId ?? '' },
              query: { ...request?.params.query, limit: 2 },
            },
          })
        },
      }
    }
    return { wrap, release: () => act(async () => release()) }
  }

  // Restoring marks the lists stale, which cancels the page that was on its way and reads the loaded ones again. The page
  // never arrives, so the focus is the one of any row that leaves: the row that takes its place, not the one after it.
  it('cancels the page and keeps the focus on the row that took its place', async () => {
    const { wrap, release } = threeInPagesOfTwo()
    const { user } = renderScreen('/trash', { wrap })
    await user.click(await within(main()).findByRole('button', { name: 'Load more' }))

    await user.click(panelButton(fixtures.launchPlan.title, 'Restore'))
    await waitFor(() => expect(queryRow(fixtures.launchPlan.title)).not.toBeInTheDocument())
    await release()

    expect(row(first.title)).toHaveFocus()
  })
})

describe('restoring a document from the middle of the list', () => {
  it('selects the row that took its place and gives it the focus, not the first one', async () => {
    const { user } = await openTrash({
      wrap: (dataSource) => {
        const archivedThird = dataSource.archiveDocument({ params: { path: { documentId: fixtures.launchPlan.id } } })
        return {
          ...dataSource,
          listDocuments: async (request) => {
            await archivedThird
            return dataSource.listDocuments(request)
          },
        }
      },
    })
    await user.click(row(first.title))

    await user.click(panelButton(first.title, 'Restore'))

    await waitFor(() => expect(row(second.title)).toHaveFocus())
    expect(selectedRow()).toBe(row(second.title))
  })
})

describe('restoring two documents at once', () => {
  it('says each was restored, and keeps each document busy until its own answer', async () => {
    const { wrap, answer } = held('restoreDocument')
    const { user } = await openTrash({ wrap })
    await user.click(panelButton(first.title, 'Restore'))
    await user.click(row(second.title))
    await user.click(panelButton(second.title, 'Restore'))
    expect(within(panel(second.title)).getByRole('button', { busy: true })).toBeInTheDocument()
    await user.click(row(first.title))
    expect(within(panel(first.title)).getByRole('button', { busy: true })).toBeInTheDocument()

    // The first answer comes while the second is still on its way.
    await answer(first.id)
    await waitFor(() => expect(spoken()).toContain(`“${first.title}” was restored.`))
    await waitFor(() => expect(queryRow(first.title)).not.toBeInTheDocument())
    expect(within(panel(second.title)).getByRole('button', { busy: true })).toBeInTheDocument()

    await answer(second.id)
    await waitFor(() => expect(spoken()).toContain(`“${second.title}” was restored.`))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Trash' })).toHaveFocus())
  })

  it('does not let a document that is being restored be deleted, and lets the others be', async () => {
    const { wrap } = held('restoreDocument')
    const { user } = await openTrash({ wrap })

    await user.click(panelButton(first.title, 'Restore'))
    expect(panelButton(first.title, 'Delete permanently')).toBeDisabled()

    await user.click(row(second.title))
    expect(panelButton(second.title, 'Delete permanently')).toBeEnabled()
  })
})

describe('deleting a document for good', () => {
  it('cannot be closed while the deletion is on its way, and says what happened when it answers', async () => {
    const { wrap, answer } = held('deleteDocument')
    const { user } = await openTrash({ wrap })
    await user.click(panelButton(first.title, 'Delete permanently'))
    const dialog = await deletionDialog(first.title)
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))

    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.getByRole('dialog', { name: `Delete “${first.title}” permanently?` })).toBeInTheDocument()

    await answer(first.id)

    await waitFor(() => expect(spoken()).toContain(`“${first.title}” was deleted permanently.`))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(row(second.title)).toHaveFocus())
  })

  it('asks first, naming the document and saying that it cannot be undone', async () => {
    const { user } = await openTrash()
    await user.click(row(second.title))

    await user.click(panelButton(second.title, 'Delete permanently'))

    const dialog = await deletionDialog(second.title)
    expect(dialog).toHaveAccessibleDescription(/This can't be undone\./)
  })

  it('keeps the document when the person cancels, and puts the focus back on the button that opened the dialog', async () => {
    const { calls, wrap } = watching('deleteDocument')
    const { user } = await openTrash({ wrap })
    await user.click(row(second.title))
    await user.click(panelButton(second.title, 'Delete permanently'))

    await user.click(within(await deletionDialog(second.title)).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls).not.toHaveBeenCalled()
    expect(row(second.title)).toBeInTheDocument()
    expect(panelButton(second.title, 'Delete permanently')).toHaveFocus()
  })

  it('deletes it when the person confirms, and the document leaves the trash', async () => {
    const { calls, wrap } = watching('deleteDocument')
    const { user } = await openTrash({ wrap })
    await user.click(row(second.title))
    await user.click(panelButton(second.title, 'Delete permanently'))

    await user.click(within(await deletionDialog(second.title)).getByRole('button', { name: 'Delete permanently' }))

    await waitFor(() => expect(queryRow(second.title)).not.toBeInTheDocument())
    expect(calls).toHaveBeenCalledWith({ params: { path: { documentId: second.id } } })
  })

  it('marks stale exactly what the table of the contract says', async () => {
    const { user, invalidatedKeys } = await openTrash()
    await user.click(row(second.title))
    await user.click(panelButton(second.title, 'Delete permanently'))

    await user.click(within(await deletionDialog(second.title)).getByRole('button', { name: 'Delete permanently' }))

    await waitFor(() =>
      expect(invalidatedKeys()).toEqual(keysAfterMutation('deleteDocument', { workspaceId, documentId: second.id })),
    )
  })

  it('says it was deleted in a live region, and selects the row that takes its place and gives it the focus', async () => {
    const { user } = await openTrash()
    await user.click(panelButton(first.title, 'Delete permanently'))

    await user.click(within(await deletionDialog(first.title)).getByRole('button', { name: 'Delete permanently' }))

    await waitFor(() => expect(spoken()).toContain(`“${first.title}” was deleted permanently.`))
    await waitFor(() => expect(row(second.title)).toHaveFocus())
    expect(selectedRow()).toBe(row(second.title))
    expect(panel(second.title)).toBeInTheDocument()
  })

  it('moves the focus to the headline when the last document is deleted', async () => {
    const { user } = await openTrash()
    await user.click(row(second.title))
    await user.click(panelButton(second.title, 'Restore'))
    await waitFor(() => expect(row(first.title)).toHaveFocus())
    await user.click(panelButton(first.title, 'Delete permanently'))

    await user.click(within(await deletionDialog(first.title)).getByRole('button', { name: 'Delete permanently' }))

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Trash' })).toHaveFocus())
    expect(within(main()).getByText('The trash is empty')).toBeInTheDocument()
  })

  it('says why it could not, inside the dialog, and keeps the document and the dialog', async () => {
    const { user } = await openTrash({
      wrap: (dataSource) => ({ ...dataSource, deleteDocument: () => Promise.reject(answer(503, 'unavailable')) }),
    })
    await user.click(row(second.title))
    await user.click(panelButton(second.title, 'Delete permanently'))
    const dialog = await deletionDialog(second.title)

    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Draftroom is unavailable right now.')
    expect(row(second.title)).toBeInTheDocument()
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
    await user.click(row(second.title))
    await user.click(panelButton(second.title, 'Delete permanently'))

    await user.click(within(await deletionDialog(second.title)).getByRole('button', { name: 'Delete permanently' }))

    expect(await within(main()).findByRole('alert')).toHaveTextContent(
      `“${second.title}” isn't in the trash any more: someone else restored or deleted it.`,
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(queryRow(second.title)).not.toBeInTheDocument())
    expect(invalidatedKeys()).toEqual(keysAfterMutation('deleteDocument', { workspaceId, documentId: second.id }))
    expect(row(first.title)).toHaveFocus()
  })
})
