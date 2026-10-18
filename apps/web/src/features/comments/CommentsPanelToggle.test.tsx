import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { simulateViewport } from '../../test/viewport.ts'
import { rangeOf } from './testing/pairedEditors.ts'
import { renderCommentedDocument } from './testing/openCommentedDocument.tsx'

const paragraphs = ['The launch moves to the second week of November.', 'Marketing prepares the announcement.']

const textArea = () => screen.findByRole('textbox', { name: 'Document content' })
const toggle = () => screen.findByRole('button', { name: /^Comments/ })
const panel = () => screen.queryByRole('complementary', { name: 'Comments and activity' })
const marks = () => [...document.querySelectorAll('mark')].map((mark) => mark.textContent)

describe('the comments panel opening and closing', () => {
  afterEach(() => vi.restoreAllMocks())

  it('closes and opens from the band, keeps the focus on the button that did it and says what happened', async () => {
    const user = userEvent.setup()
    renderCommentedDocument({ paragraphs })
    const button = await toggle()
    await waitFor(() => expect(panel()).toBeInTheDocument())
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveAttribute('aria-controls', 'comments-panel')

    button.focus()
    await user.keyboard('{Enter}')

    expect(panel()).not.toBeInTheDocument()
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveFocus()
    expect(screen.getByText('Comments panel hidden')).toBeInTheDocument()

    await user.keyboard(' ')

    expect(panel()).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveFocus()
    expect(screen.getByText('Comments panel shown')).toBeInTheDocument()
  })

  it('says it in Spanish, with the number of open threads in the name of the button', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    const user = userEvent.setup()
    renderCommentedDocument({ paragraphs })

    const button = await screen.findByRole('button', { name: 'Comentarios, 1 abierto' })
    await user.click(button)

    expect(screen.getByText('Panel de comentarios oculto')).toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('counts the open threads in the name of the button, whether the panel is shown or not', async () => {
    const user = userEvent.setup()
    renderCommentedDocument({ paragraphs })

    const button = await screen.findByRole('button', { name: 'Comments, 1 open' })
    await user.click(button)

    expect(button).toHaveAccessibleName('Comments, 1 open')
  })

  it('keeps the highlights of the threads and the comment being written while the panel is closed', async () => {
    const user = userEvent.setup()
    renderCommentedDocument({
      paragraphs,
      started: [{ quote: 'second week', body: 'Is this final?' }],
      fixtureThreads: false,
    })
    await waitFor(() => expect(marks()).toEqual(['second week']))

    await user.click(await toggle())
    expect(panel()).not.toBeInTheDocument()
    expect(marks()).toEqual(['second week'])

    await user.click(await toggle())
    expect(within(panel() as HTMLElement).getByText('Is this final?')).toBeInTheDocument()
  })

  it('opens by itself when the person asks to comment on a selection, and puts them in the form', async () => {
    const user = userEvent.setup()
    renderCommentedDocument({ paragraphs })
    const text = (await textArea()) as HTMLElement & { editor: Editor }
    await user.click(await toggle())
    expect(panel()).not.toBeInTheDocument()
    act(() => void text.editor.commands.setTextSelection(rangeOf(text.editor, 'second week')))
    text.focus()

    await user.keyboard('{Control>}{Alt>}m{/Alt}{/Control}')

    const comments = await screen.findByRole('complementary', { name: 'Comments and activity' })
    expect(await within(comments).findByRole('textbox', { name: 'Your comment' })).toHaveFocus()
  })
})

describe('where the panel starts', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    { width: 1280, open: false },
    { width: 1439, open: false },
    { width: 1440, open: true },
  ])('is open: $open in a window of $width px, when the person has not chosen', async ({ width, open }) => {
    simulateViewport(width)
    renderCommentedDocument({ paragraphs })

    const button = await toggle()

    expect(button).toHaveAttribute('aria-expanded', String(open))
    expect(panel() !== null).toBe(open)
  })

  it('goes with the choice of the person, at any width, and the next document opens as the last was left', async () => {
    const user = userEvent.setup()
    simulateViewport(1280)
    const first = renderCommentedDocument({ paragraphs })
    await user.click(await toggle())
    expect(await screen.findByRole('complementary', { name: 'Comments and activity' })).toBeInTheDocument()
    first.unmount()

    renderCommentedDocument({ paragraphs })

    expect(await toggle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('is not changed by a request from the text: opening it for a thread is not a choice of layout', async () => {
    const user = userEvent.setup()
    simulateViewport(1280)
    const first = renderCommentedDocument({ paragraphs })
    const text = (await textArea()) as HTMLElement & { editor: Editor }
    act(() => void text.editor.commands.setTextSelection(rangeOf(text.editor, 'second week')))
    text.focus()
    await user.keyboard('{Control>}{Alt>}m{/Alt}{/Control}')
    await screen.findByRole('complementary', { name: 'Comments and activity' })
    first.unmount()

    renderCommentedDocument({ paragraphs })

    expect(await toggle()).toHaveAttribute('aria-expanded', 'false')
  })
})
