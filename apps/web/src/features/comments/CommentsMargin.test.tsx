import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { ApiError, TransportError } from '../../data/errors.ts'
import { sofia } from '../../data/mock/fixtures/index.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { budget, people } from '../editor/testing/renderEditor.tsx'
import { findMargin, openThread, renderCommentedDocument, threadOf } from './testing/openCommentedDocument.tsx'

/** A data source whose threads are what the test says, or whose request fails or waits. */
const threadsThat = (listThreads: DataSource['listThreads']) => (dataSource: DataSource) => ({
  ...dataSource,
  listThreads,
})

const signedOff = 'Who signs it off? Finance has not seen the new tiers yet.'

const paragraphs = ['The launch moves to the second week of November.', 'Marketing prepares the announcement.']
const first = { quote: 'second week', body: 'First thread' }
const second = { quote: 'the announcement', body: 'Second thread' }

describe('the controls of the comments in the bar', () => {
  it('has the tabs Comments and Activity, with the comments first', async () => {
    renderCommentedDocument()
    await findMargin()

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => [tab.textContent, tab.getAttribute('aria-selected')])).toEqual([
      ['Comments', 'true'],
      ['Activity', 'false'],
    ])
  })

  it('shows the activity of the document at the edge of the window, and closes it from its own button or from the tab', async () => {
    const user = userEvent.setup()
    renderCommentedDocument()
    await findMargin()

    await user.click(screen.getByRole('tab', { name: 'Activity' }))

    const activity = await screen.findByRole('complementary', { name: 'Activity' })
    expect(await within(activity).findAllByRole('heading', { level: 3 })).not.toHaveLength(0)
    expect(within(activity).getByRole('heading', { level: 2, name: 'Activity' })).toBeInTheDocument()

    await user.click(within(activity).getByRole('button', { name: 'Close the activity' }))
    expect(screen.queryByRole('complementary', { name: 'Activity' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Comments' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'Activity' }))
    await user.click(screen.getByRole('tab', { name: 'Comments' }))
    expect(screen.queryByRole('complementary', { name: 'Activity' })).not.toBeInTheDocument()
  })

  it('keeps the margin while the activity is open: it is the only list apart from the text', async () => {
    const user = userEvent.setup()
    renderCommentedDocument()
    const margin = await findMargin()

    await user.click(screen.getByRole('tab', { name: 'Activity' }))

    expect(margin).toBeVisible()
    expect(within(margin).getByText(signedOff)).toBeInTheDocument()
  })

  it('is written in the language of the person', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderCommentedDocument()
    await findMargin()

    expect(screen.getByRole('tab', { name: 'Comentarios' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Actividad' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^Abiertos \(1\)$/ })).toBeInTheDocument()
    localStorage.removeItem(localeStorageKey)
  })
})

describe('the threads of the margin', () => {
  it('lists the threads compact, and makes the whole card of the one that is chosen, which is the thread the person is on', async () => {
    const user = userEvent.setup()
    renderCommentedDocument({ paragraphs, fixtureThreads: false, started: [first, second] })
    const margin = await findMargin()
    await waitFor(() => expect(within(margin).getAllByRole('button', { expanded: false })).toHaveLength(2))
    expect(within(margin).queryByRole('article')).not.toBeInTheDocument()

    const card = await openThread(user, margin, 'First thread')

    expect(card).toHaveAttribute('aria-current', 'true')
    expect(within(card).getByRole('textbox', { name: 'Reply to this thread' })).toBeInTheDocument()
    expect(threadOf(margin, 'Second thread').tagName).toBe('BUTTON')
  })

  it('gives the card back to its compact form when another thread is chosen', async () => {
    const user = userEvent.setup()
    renderCommentedDocument({ paragraphs, fixtureThreads: false, started: [first, second] })
    const margin = await findMargin()
    await within(margin).findByText('Second thread')
    await openThread(user, margin, 'First thread')

    await openThread(user, margin, 'Second thread')

    expect(threadOf(margin, 'First thread').tagName).toBe('BUTTON')
    expect(within(margin).getAllByRole('article')).toHaveLength(1)
  })

  it('says who started a thread, when, the start of what was said and how many replies it has', async () => {
    renderCommentedDocument()
    const margin = await findMargin()
    await within(margin).findByText(signedOff)

    const thread = threadOf(margin, signedOff)

    expect(within(thread).getByText('Sofía Lindqvist')).toBeInTheDocument()
    expect(thread.querySelector('time')).toHaveAttribute('datetime')
    expect(within(thread).getByText('1 reply')).toBeInTheDocument()
  })

  it('says nothing, and takes no room, when there are no comments', async () => {
    renderCommentedDocument({ wrap: threadsThat(async () => ({ items: [] })) })
    const margin = await findMargin()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open (0)' })).toBeInTheDocument())

    // Only its name for a screen reader: nothing to read, to choose or to explain.
    expect(margin).toHaveTextContent(/^Comments$/)
    expect(within(margin).queryByRole('button')).not.toBeInTheDocument()
  })

  it('lets a reader read the conversation and gives them nothing to write with', async () => {
    const user = userEvent.setup()
    renderCommentedDocument({
      signedInAs: people.daniel,
      documentId: budget.id,
      wrap: threadsThat(async () => ({
        items: [
          {
            id: 'thread-1',
            documentId: budget.id,
            status: 'open',
            anchor: { start: '', end: '' },
            quote: 'the total',
            createdBy: { id: sofia.id, name: 'Sofía Lindqvist' },
            createdAt: '2026-10-12T09:10:00.000Z',
            resolvedAt: null,
            resolvedBy: null,
            comments: [
              {
                id: 'comment-1',
                threadId: 'thread-1',
                author: { id: sofia.id, name: 'Sofía Lindqvist' },
                body: 'Is this the final number?',
                createdAt: '2026-10-12T09:10:00.000Z',
                updatedAt: '2026-10-12T09:10:00.000Z',
              },
            ],
          },
        ],
      })),
    })
    const margin = await findMargin()
    await within(margin).findByText('Is this the final number?')

    const card = await openThread(user, margin, 'Is this the final number?')

    expect(within(card).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument()
    expect(within(margin).queryByRole('button', { name: 'Comment on the selected text' })).not.toBeInTheDocument()
  })
})

describe('the states of the comments', () => {
  it('holds the text back, as the skeleton of the page, until the comments have arrived, so they open no room under the person’s eyes', async () => {
    let arrive: (() => void) | undefined
    renderCommentedDocument({
      wrap: (dataSource) => ({
        ...dataSource,
        listThreads: (request) => new Promise((resolve) => (arrive = () => resolve(dataSource.listThreads(request)))),
      }),
    })

    // The comments are asked for by the screen of the document, so once they are, that is the skeleton on the page. The text
    // would be there by now (the document loads in a moment, in the mock) if the comments did not hold it back.
    await waitFor(() => expect(arrive).toBeDefined())
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(screen.getByText('Loading document')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Document content' })).not.toBeInTheDocument()

    await act(async () => arrive?.())

    expect(await screen.findByRole('textbox', { name: 'Document content' })).toBeInTheDocument()
    expect(screen.queryByText('Loading document')).not.toBeInTheDocument()
  })

  it('shows the text when the comments could not load, and says so in the margin', async () => {
    renderCommentedDocument({
      wrap: threadsThat(async () => {
        throw new ApiError({ type: 'about:blank', title: 'x', status: 500, code: 'internal-error' })
      }),
    })

    expect(await screen.findByRole('textbox', { name: 'Document content' })).toBeInTheDocument()
    expect(await within(await findMargin()).findByRole('alert')).toBeInTheDocument()
  })

  it('says it could not load them, and loads them when the person tries again', async () => {
    const user = userEvent.setup()
    // The page asks first, to hold the text back, and the margin asks again when it comes: it keeps failing until it is told.
    let failing = true
    renderCommentedDocument({
      wrap: (dataSource) => ({
        ...dataSource,
        listThreads: async (request) => {
          if (failing) throw new ApiError({ type: 'about:blank', title: 'x', status: 500, code: 'internal-error' })
          return dataSource.listThreads(request)
        },
      }),
    })
    const margin = await findMargin()

    expect(await within(margin).findByRole('alert')).toHaveTextContent("We couldn't load the comments")
    failing = false
    await user.click(within(margin).getByRole('button', { name: 'Try again' }))

    expect(await within(margin).findByText(signedOff)).toBeInTheDocument()
    expect(within(margin).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('tells a failure of the network from one of the server only by what it does: it can be tried again', async () => {
    renderCommentedDocument({
      wrap: threadsThat(async () => {
        throw new TransportError(null)
      }),
    })
    const margin = await findMargin()

    expect(await within(margin).findByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('open and resolved threads, with a filter', () => {
  it('lists the open threads first and counts each choice of the filter', async () => {
    renderCommentedDocument()
    const margin = await findMargin()

    const choices = await screen.findAllByRole('button', { name: /^(Open|Resolved|All) \(/ })
    expect(choices.map((choice) => [choice.textContent, choice.getAttribute('aria-pressed')])).toEqual([
      ['Open (1)', 'true'],
      ['Resolved (1)', 'false'],
      ['All (2)', 'false'],
    ])
    expect(within(margin).getAllByRole('button', { expanded: false })).toHaveLength(1)
    expect(within(margin).getByText(signedOff)).toBeInTheDocument()
  })

  it('shows the resolved ones, with their marker, when the filter says so', async () => {
    const user = userEvent.setup()
    renderCommentedDocument()
    const margin = await findMargin()

    await user.click(await screen.findByRole('button', { name: /^Resolved \(/ }))

    const thread = await within(margin).findByText('Resolved')
    expect(thread.closest('[data-thread-id]')).toHaveAttribute('data-state', 'resolved')
    const card = await openThread(user, margin, 'Resolved')
    expect(within(card).getByRole('button', { name: 'Reopen' })).toBeInTheDocument()
  })

  it('shows all of them together', async () => {
    const user = userEvent.setup()
    renderCommentedDocument()
    const margin = await findMargin()

    await user.click(await screen.findByRole('button', { name: /^All \(/ }))

    await waitFor(() => expect(within(margin).getAllByRole('button', { expanded: false })).toHaveLength(2))
  })

  it('says there are none of the kind the filter asks for, while others exist', async () => {
    renderCommentedDocument({
      wrap: (dataSource) => ({
        ...dataSource,
        listThreads: async (request) => ({
          items: (await dataSource.listThreads(request)).items.filter((thread) => thread.status === 'resolved'),
        }),
      }),
    })
    const margin = await findMargin()

    expect(await within(margin).findByText('No open comments')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open (0)' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(margin).queryByRole('button', { expanded: false })).not.toBeInTheDocument()
  })
})

describe('what the margin says when an action on a thread is refused', () => {
  const refused = (code: 'unavailable' | 'forbidden') =>
    new ApiError({ type: 'about:blank', title: 'x', status: code === 'forbidden' ? 403 : 503, code })

  const actions = [
    {
      action: 'a reply',
      fails: 'replyToThread' as const,
      then: 'Draftroom is unavailable right now.',
      code: 'unavailable' as const,
    },
    {
      action: 'resolving',
      fails: 'resolveThread' as const,
      then: "You don't have permission to do that.",
      code: 'forbidden' as const,
    },
  ]

  it.each(actions)(
    "tells $action in the language of the person, not in the server's",
    async ({ fails, then, code }) => {
      const user = userEvent.setup()
      renderCommentedDocument({
        wrap: (dataSource) => ({
          ...dataSource,
          [fails]: async () => {
            throw refused(code)
          },
        }),
      })
      const margin = await findMargin()
      await within(margin).findByText(signedOff)
      const card = await openThread(user, margin, signedOff)

      if (fails === 'replyToThread') {
        await user.type(within(card).getByRole('textbox', { name: 'Reply to this thread' }), 'Noted')
        await user.click(within(card).getByRole('button', { name: 'Reply' }))
      } else {
        await user.click(within(card).getByRole('button', { name: 'Resolve' }))
      }

      expect(await within(card).findByRole('alert')).toHaveTextContent(then)
    },
  )
})
