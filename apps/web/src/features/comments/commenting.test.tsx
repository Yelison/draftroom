import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/core'
import { documentName } from '@draftroom/contract/collab'
import type { DataSource } from '../../data/DataSource.ts'
import { ApiError } from '../../data/errors.ts'
import { launchPlan, people } from '../editor/testing/renderEditor.tsx'
import { rangeOf } from './testing/pairedEditors.ts'
import { findPanel, renderCommentedDocument } from './testing/openCommentedDocument.tsx'

const paragraphs = ['The launch moves to the second week of November.', 'Marketing prepares the announcement.']

const textArea = () => screen.findByRole('textbox', { name: 'Document content' })

/** The editor behind the text area, which Tiptap hangs on the element it draws. */
async function editorOf(): Promise<Editor> {
  const text = (await textArea()) as HTMLElement & { editor: Editor }
  return text.editor
}

const select = (editor: Editor, text: string) => act(() => void editor.commands.setTextSelection(rangeOf(editor, text)))

describe('commenting on a selection', () => {
  const people_ = [
    { who: 'an editor', signedInAs: people.daniel, editable: 'true' },
    { who: 'a commenter, whose text takes no edits', signedInAs: people.sofia, editable: 'false' },
  ]

  it.each(people_)(
    'is offered to $who once text is selected, and not before, and creates the thread',
    async ({ signedInAs, editable }) => {
      const user = userEvent.setup()
      renderCommentedDocument({ signedInAs, paragraphs })
      const editor = await editorOf()
      const panel = await findPanel()
      expect(await textArea()).toHaveAttribute('contenteditable', editable)

      expect(within(panel).getByText('Select some text to comment on it.')).toBeInTheDocument()
      expect(within(panel).queryByRole('button', { name: 'Comment on the selected text' })).not.toBeInTheDocument()
      await select(editor, 'second week')

      const action = await within(panel).findByRole('button', { name: 'Comment on the selected text' })
      expect(action).toHaveAttribute('aria-keyshortcuts', 'Control+Alt+M')
      await user.click(action)
      expect(within(panel).getByRole('region', { name: 'New comment' })).toHaveTextContent('second week')

      // Whatever the text allows, the thread is the server's: it is created, listed and highlighted.
      await user.type(within(panel).getByRole('textbox', { name: 'Your comment' }), 'Is this date final?')
      await user.click(within(panel).getByRole('button', { name: 'Comment' }))
      expect(await within(panel).findByText('Comment added.')).toBeInTheDocument()
      expect(within(panel).getByText('Is this date final?')).toBeInTheDocument()
      await waitFor(() => expect(document.querySelector('mark')?.textContent).toBe('second week'))
    },
  )

  it('creates the thread with an anchor on the selection, the quote and the text, and takes the person to its card', async () => {
    const user = userEvent.setup()
    const createThread = vi.fn<DataSource['createThread']>()
    renderCommentedDocument({
      paragraphs,
      wrap: (dataSource) => ({
        ...dataSource,
        createThread: (request) => {
          createThread(request)
          return dataSource.createThread(request)
        },
      }),
    })
    const editor = await editorOf()
    const panel = await findPanel()
    await select(editor, 'second week')

    await user.click(await within(panel).findByRole('button', { name: 'Comment on the selected text' }))
    await user.type(within(panel).getByRole('textbox', { name: 'Your comment' }), 'Is this date final?')
    await user.click(within(panel).getByRole('button', { name: 'Comment' }))

    await waitFor(() => expect(createThread).toHaveBeenCalledOnce())
    const sent = createThread.mock.calls[0]?.[0]
    expect(sent?.params.path.documentId).toBe(launchPlan.id)
    expect(sent?.body).toMatchObject({ quote: 'second week', body: 'Is this date final?' })
    await waitFor(() =>
      expect(
        within(panel)
          .getAllByRole('article')
          .find((row) => row.contains(document.activeElement)),
      ).toBeDefined(),
    )
    expect(within(panel).getByText('Is this date final?')).toBeInTheDocument()
    expect(within(panel).queryByRole('region', { name: 'New comment' })).not.toBeInTheDocument()
    expect(within(panel).getByText('Comment added.')).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('mark')?.textContent).toBe('second week'))
  })

  it('cuts the quote at 500 characters, never in the middle of an emoji', async () => {
    const user = userEvent.setup()
    const createThread = vi.fn<DataSource['createThread']>()
    renderCommentedDocument({
      paragraphs: ['😀'.repeat(501)],
      wrap: (dataSource) => ({
        ...dataSource,
        createThread: (request) => {
          createThread(request)
          return dataSource.createThread(request)
        },
      }),
    })
    const editor = await editorOf()
    const panel = await findPanel()
    await select(editor, '😀'.repeat(501))

    await user.click(await within(panel).findByRole('button', { name: 'Comment on the selected text' }))
    await user.type(within(panel).getByRole('textbox', { name: 'Your comment' }), 'Too long a quote')
    await user.click(within(panel).getByRole('button', { name: 'Comment' }))

    await waitFor(() => expect(createThread).toHaveBeenCalledOnce())
    expect([...(createThread.mock.calls[0]?.[0].body.quote ?? '')]).toHaveLength(500)
  })

  it('keeps what was written, and says why, when the server refuses the thread, and sends it when tried again', async () => {
    const user = userEvent.setup()
    let refusals = 1
    renderCommentedDocument({
      paragraphs,
      wrap: (dataSource) => ({
        ...dataSource,
        createThread: async (request) => {
          if (refusals-- > 0) throw new ApiError({ type: 'about:blank', title: 'x', status: 503, code: 'unavailable' })
          return dataSource.createThread(request)
        },
      }),
    })
    const editor = await editorOf()
    const panel = await findPanel()
    await select(editor, 'second week')

    await user.click(await within(panel).findByRole('button', { name: 'Comment on the selected text' }))
    const field = within(panel).getByRole('textbox', { name: 'Your comment' })
    await user.type(field, 'Is this date final?')
    await user.click(within(panel).getByRole('button', { name: 'Comment' }))

    expect(await within(panel).findByRole('alert')).toHaveTextContent('Draftroom is unavailable right now.')
    expect(field).toHaveValue('Is this date final?')

    await user.click(within(panel).getByRole('button', { name: 'Comment' }))
    expect(await within(panel).findByText('Comment added.')).toBeInTheDocument()
  })

  it('does not lose the text of the thread when the selection is lost or the text changes while it is written', async () => {
    const user = userEvent.setup()
    const createThread = vi.fn<DataSource['createThread']>()
    renderCommentedDocument({
      paragraphs,
      wrap: (dataSource) => ({
        ...dataSource,
        createThread: (request) => {
          createThread(request)
          return dataSource.createThread(request)
        },
      }),
    })
    const editor = await editorOf()
    const panel = await findPanel()
    await select(editor, 'second week')
    await user.click(await within(panel).findByRole('button', { name: 'Comment on the selected text' }))
    await user.type(within(panel).getByRole('textbox', { name: 'Your comment' }), 'Still here')

    // Someone types before the commented text, and the selection moves away from it.
    act(() => void editor.commands.insertContentAt(1, 'Note: '))
    act(() => void editor.commands.setTextSelection(1))
    await user.click(within(panel).getByRole('button', { name: 'Comment' }))

    await waitFor(() => expect(createThread).toHaveBeenCalledOnce())
    await waitFor(() => expect(document.querySelector('mark')?.textContent).toBe('second week'))
  })

  it('asks for something to send, and gives the focus back to the text when the person cancels', async () => {
    const user = userEvent.setup()
    renderCommentedDocument({ paragraphs })
    const editor = await editorOf()
    const panel = await findPanel()
    await select(editor, 'second week')
    await user.click(await within(panel).findByRole('button', { name: 'Comment on the selected text' }))

    await user.click(within(panel).getByRole('button', { name: 'Comment' }))
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Write something before you send it.')
    await user.keyboard('{Escape}')

    expect(within(panel).queryByRole('region', { name: 'New comment' })).not.toBeInTheDocument()
    const text = await textArea()
    await waitFor(() => expect(text).toHaveFocus())
  })
})

describe('what other people do to the comments', () => {
  it('shows what another person wrote without a reload, when the server says the comments changed', async () => {
    const { server } = renderCommentedDocument({ paragraphs })
    const panel = await findPanel()
    await within(panel).findAllByRole('article')

    const sofia = server.connect({ signedInAs: people.sofia })
    const { items } = await sofia.listThreads({ params: { path: { documentId: launchPlan.id } } })
    const thread = items.find((row) => row.status === 'open')
    if (thread === undefined) throw new Error('The launch plan has no open thread to reply to')
    await act(async () => {
      await sofia.replyToThread({ params: { path: { threadId: thread.id } }, body: { body: 'Moved to Friday.' } })
      server.collaboration.broadcast(documentName(launchPlan.id), { type: 'comments-changed', threadId: thread.id })
    })

    expect(await within(panel).findByText('Moved to Friday.')).toBeInTheDocument()
  })
})
