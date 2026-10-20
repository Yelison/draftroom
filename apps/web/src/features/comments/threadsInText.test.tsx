import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { rangeOf } from './testing/pairedEditors.ts'
import { findMargin, openThread, renderCommentedDocument, threadOf } from './testing/openCommentedDocument.tsx'

const paragraphs = ['The launch moves to the second week of November.', 'Marketing prepares the announcement.']
const week = { quote: 'second week', body: 'Is this date final?' }
const announcement = { quote: 'the announcement', body: 'Who writes it?' }

async function editorOf(): Promise<Editor> {
  const text = (await screen.findByRole('textbox', { name: 'Document content' })) as HTMLElement & { editor: Editor }
  return text.editor
}

const marks = () => [...document.querySelectorAll('mark')].map((mark) => mark.textContent)

describe('the highlights of the threads', () => {
  it('mark the text of the open threads, and the card says what the text says', async () => {
    renderCommentedDocument({ paragraphs, started: [week, announcement], fixtureThreads: false })
    const margin = await findMargin()

    await waitFor(() => expect(marks()).toEqual(['second week', 'the announcement']))
    expect([week.body, announcement.body].map((body) => threadOf(margin, body).getAttribute('data-state'))).toEqual([
      'open',
      'open',
    ])
  })

  it('are not on the text of a resolved thread, which comes back when the thread is reopened', async () => {
    const user = userEvent.setup()
    renderCommentedDocument({ paragraphs, started: [week, announcement], fixtureThreads: false })
    const margin = await findMargin()
    await waitFor(() => expect(marks()).toHaveLength(2))

    await user.click(within(await openThread(user, margin, week.body)).getByRole('button', { name: 'Resolve' }))
    await waitFor(() => expect(marks()).toEqual(['the announcement']))
    expect(await within(margin).findByText('Thread resolved.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Resolved \(1\)$/ }))
    await user.click(within(await openThread(user, margin, week.body)).getByRole('button', { name: 'Reopen' }))
    await waitFor(() => expect(marks()).toEqual(['second week', 'the announcement']))
  })

  it('follow the text when the person types before it, inside it and after it', async () => {
    renderCommentedDocument({ paragraphs, started: [week], fixtureThreads: false })
    const editor = await editorOf()
    await waitFor(() => expect(marks()).toEqual(['second week']))

    act(() => void editor.commands.insertContentAt(1, 'Note: '))
    act(() => void editor.commands.insertContentAt(rangeOf(editor, 'second week').from + 6, 'X'))
    act(() => void editor.commands.insertContentAt(rangeOf(editor, 'November').to, '!'))

    expect(marks()).toEqual(['secondX week'])
  })

  it('are left alone by a thread whose text was deleted, which becomes orphaned and keeps its quote', async () => {
    renderCommentedDocument({ paragraphs, started: [week], fixtureThreads: false })
    const editor = await editorOf()
    const margin = await findMargin()
    await waitFor(() => expect(marks()).toEqual(['second week']))

    act(() => void editor.commands.deleteRange(rangeOf(editor, 'second week')))

    await waitFor(() => expect(threadOf(margin, week.body)).toHaveAttribute('data-state', 'orphaned'))
    expect(marks()).toEqual([])
    expect(within(margin).getByText('second week')).toBeInTheDocument()
    expect(within(margin).getByText('Text removed')).toBeInTheDocument()
  })

  it('are not made orphaned when the anchors point at text the document has not shown yet: threads made elsewhere are placed once it does', async () => {
    // The fixtures' own threads have anchors that point at nothing, which is what an orphan is once the document is there.
    renderCommentedDocument({ paragraphs })
    const margin = await findMargin()

    await waitFor(() =>
      expect(threadOf(margin, 'Who signs it off? Finance has not seen the new tiers yet.')).toHaveAttribute(
        'data-state',
        'orphaned',
      ),
    )
    expect(marks()).toEqual([])
  })
})

describe('moving between the text and its threads with the keyboard', () => {
  it('takes the person to the card of the highlight their caret is in, and Escape brings them back with the text selected', async () => {
    const user = userEvent.setup()
    renderCommentedDocument({ paragraphs, started: [week, announcement], fixtureThreads: false })
    const editor = await editorOf()
    const margin = await findMargin()
    await waitFor(() => expect(marks()).toHaveLength(2))
    const text = await screen.findByRole('textbox', { name: 'Document content' })

    text.focus()
    act(() => void editor.commands.setTextSelection(rangeOf(editor, 'the announcement').from + 3))
    await user.keyboard('{Control>}{Alt>}m{/Alt}{/Control}')

    // The thread the key took the person to is the active one: its whole card, with the focus.
    await waitFor(() => expect(threadOf(margin, announcement.body)).toHaveFocus())
    const card = threadOf(margin, announcement.body)
    expect(card.tagName).toBe('ARTICLE')
    expect(card).toHaveAttribute('aria-current', 'true')
    expect(threadOf(margin, week.body).tagName).toBe('BUTTON')
    expect(document.querySelector('mark[data-active]')?.textContent).toBe('the announcement')

    await user.keyboard('{Escape}')

    await waitFor(() => expect(text).toHaveFocus())
    const { from, to } = rangeOf(editor, 'the announcement')
    expect(editor.state.selection).toMatchObject({ from, to })
  })

  it('opens the form for the selection when the person presses the key with text selected, with the focus in the field', async () => {
    const user = userEvent.setup()
    renderCommentedDocument({ paragraphs, fixtureThreads: false })
    const editor = await editorOf()
    const margin = await findMargin()
    const text = await screen.findByRole('textbox', { name: 'Document content' })

    text.focus()
    act(() => void editor.commands.setTextSelection(rangeOf(editor, 'second week')))
    await user.keyboard('{Control>}{Alt>}m{/Alt}{/Control}')

    const field = await within(margin).findByRole('textbox', { name: 'Your comment' })
    await waitFor(() => expect(field).toHaveFocus())
  })

  it('closes the activity when the text asks for a thread or for a comment', async () => {
    const user = userEvent.setup()
    renderCommentedDocument({ paragraphs, started: [week], fixtureThreads: false })
    const editor = await editorOf()
    const margin = await findMargin()
    const text = await screen.findByRole('textbox', { name: 'Document content' })
    await waitFor(() => expect(marks()).toHaveLength(1))

    await user.click(screen.getByRole('tab', { name: 'Activity' }))
    expect(await screen.findByRole('complementary', { name: 'Activity' })).toBeInTheDocument()
    text.focus()
    act(() => void editor.commands.setTextSelection(rangeOf(editor, 'second week').from + 2))
    await user.keyboard('{Control>}{Alt>}m{/Alt}{/Control}')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Comments' })).toHaveAttribute('aria-selected', 'true'))
    expect(screen.queryByRole('complementary', { name: 'Activity' })).not.toBeInTheDocument()
    await waitFor(() => expect(threadOf(margin, week.body)).toHaveFocus())

    await user.click(screen.getByRole('tab', { name: 'Activity' }))
    text.focus()
    act(() => void editor.commands.setTextSelection(rangeOf(editor, 'the announcement')))
    await user.keyboard('{Control>}{Alt>}m{/Alt}{/Control}')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Comments' })).toHaveAttribute('aria-selected', 'true'))
    expect(await within(margin).findByRole('region', { name: 'New comment' })).toBeInTheDocument()
  })

  it('also works for a commenter, whose text takes no edits', async () => {
    const user = userEvent.setup()
    renderCommentedDocument({
      paragraphs,
      started: [week],
      fixtureThreads: false,
      signedInAs: 'sofia@harborpine.example',
    })
    const editor = await editorOf()
    const margin = await findMargin()
    await waitFor(() => expect(marks()).toEqual(['second week']))
    const text = await screen.findByRole('textbox', { name: 'Document content' })
    expect(text).toHaveAttribute('tabindex', '0')

    text.focus()
    act(() => void editor.commands.setTextSelection(rangeOf(editor, 'second week').from + 2))
    await user.keyboard('{Control>}{Alt>}m{/Alt}{/Control}')

    await waitFor(() => expect(threadOf(margin, week.body)).toHaveFocus())
  })
})

describe('where the focus goes when a card leaves the margin', () => {
  it('goes to the next card when a thread is resolved', async () => {
    const user = userEvent.setup()
    renderCommentedDocument({ paragraphs, started: [week, announcement], fixtureThreads: false })
    const margin = await findMargin()
    await waitFor(() => expect(marks()).toHaveLength(2))

    await user.click(within(await openThread(user, margin, week.body)).getByRole('button', { name: 'Resolve' }))

    await waitFor(() => expect(threadOf(margin, announcement.body)).toHaveFocus())
  })

  it('goes to the heading of the comments when the last open thread is resolved, never to the page', async () => {
    const user = userEvent.setup()
    renderCommentedDocument({ paragraphs, started: [week], fixtureThreads: false })
    const margin = await findMargin()
    await waitFor(() => expect(marks()).toHaveLength(1))

    await user.click(within(await openThread(user, margin, week.body)).getByRole('button', { name: 'Resolve' }))

    await waitFor(() => expect(within(margin).queryByText(week.body)).not.toBeInTheDocument())
    await waitFor(() => expect(within(margin).getByRole('heading', { level: 2, name: 'Comments' })).toHaveFocus())
  })

  it('goes to the card when one of its comments is deleted and the thread stays', async () => {
    const user = userEvent.setup()
    renderCommentedDocument({ paragraphs, started: [week], fixtureThreads: false })
    const margin = await findMargin()
    await waitFor(() => expect(marks()).toHaveLength(1))
    const card = await openThread(user, margin, week.body)
    await user.type(within(card).getByRole('textbox', { name: 'Reply to this thread' }), 'Yes, it is.')
    await user.click(within(card).getByRole('button', { name: 'Reply' }))
    await within(margin).findByText('Yes, it is.')

    const [, reply] = within(margin).getAllByRole('button', { name: 'Delete the comment by Marta Ruiz' })
    await user.click(reply as HTMLElement)
    await user.click(within(margin).getByRole('button', { name: 'Delete comment' }))

    await waitFor(() => expect(within(margin).queryByText('Yes, it is.')).not.toBeInTheDocument())
    await waitFor(() => expect(threadOf(margin, week.body)).toHaveFocus())
    expect(await within(margin).findByText('Comment deleted.')).toBeInTheDocument()
  })
})

describe('what the margin says out loud', () => {
  it('announces in the language of the person', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    const user = userEvent.setup()
    renderCommentedDocument({ paragraphs, started: [week], fixtureThreads: false })
    const margin = await findMargin()
    await waitFor(() => expect(marks()).toHaveLength(1))

    await user.click(within(await openThread(user, margin, week.body)).getByRole('button', { name: 'Resolver' }))

    expect(await within(margin).findByText('Hilo resuelto.')).toBeInTheDocument()
    localStorage.removeItem(localeStorageKey)
  })
})
