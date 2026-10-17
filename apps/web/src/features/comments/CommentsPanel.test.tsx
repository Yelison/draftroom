import { act, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { ApiError, TransportError } from '../../data/errors.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { budget, people } from '../editor/testing/renderEditor.tsx'
import { findPanel, renderCommentedDocument } from './testing/openCommentedDocument.tsx'

/** A data source whose threads are what the test says, or whose request fails or waits. */
const threadsThat = (listThreads: DataSource['listThreads']) => (dataSource: DataSource) => ({
  ...dataSource,
  listThreads,
})

describe('the panel beside the text', () => {
  it('has the tabs Comments and Activity, with the comments first', async () => {
    renderCommentedDocument()
    const panel = await findPanel()

    const tabs = within(panel).getAllByRole('tab')
    expect(tabs.map((tab) => [tab.textContent, tab.getAttribute('aria-selected')])).toEqual([
      ['Comments', 'true'],
      ['Activity', 'false'],
    ])
  })

  it('shows the activity of the document in its other tab', async () => {
    renderCommentedDocument()
    const user = userEvent.setup()
    const panel = await findPanel()

    await user.click(within(panel).getByRole('tab', { name: 'Activity' }))

    expect(await within(panel).findAllByRole('heading', { level: 3 })).not.toHaveLength(0)
    expect(within(panel).getByRole('heading', { level: 2, name: 'Activity' })).toBeInTheDocument()
  })

  it('is written in the language of the person', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderCommentedDocument()
    const panel = await findPanel()

    expect(within(panel).getByRole('tab', { name: 'Comentarios' })).toBeInTheDocument()
    expect(within(panel).getByRole('tab', { name: 'Actividad' })).toBeInTheDocument()
    expect(await within(panel).findByRole('button', { name: /^Abiertos \(1\)$/ })).toBeInTheDocument()
    localStorage.removeItem(localeStorageKey)
  })
})

describe('the states of the comments', () => {
  it('shows a skeleton with a spoken status while the threads are on the way, and then the threads', async () => {
    let arrive: () => void = () => {}
    const held = (dataSource: DataSource): DataSource => ({
      ...dataSource,
      listThreads: (request) => new Promise((resolve) => (arrive = () => resolve(dataSource.listThreads(request)))),
    })
    renderCommentedDocument({ wrap: held })
    const panel = await findPanel()

    expect(await within(panel).findByText('Loading the comments')).toBeInTheDocument()
    expect(within(panel).queryByRole('article')).not.toBeInTheDocument()

    await waitFor(() => expect(arrive).not.toBe(undefined))
    await act(async () => arrive())

    expect(await within(panel).findByRole('article')).toBeInTheDocument()
  })

  it('says there is nothing yet, and how to start, for someone who may comment', async () => {
    renderCommentedDocument({ wrap: threadsThat(async () => ({ items: [] })) })
    const panel = await findPanel()

    expect(await within(panel).findByText('No comments yet')).toBeInTheDocument()
    expect(within(panel).getByText('Select some text and choose Comment to start a conversation.')).toBeInTheDocument()
  })

  it('says there is nothing yet, without telling a reader to comment', async () => {
    renderCommentedDocument({
      signedInAs: people.daniel,
      documentId: budget.id,
      wrap: threadsThat(async () => ({ items: [] })),
    })
    const panel = await findPanel()

    expect(await within(panel).findByText('No comments yet')).toBeInTheDocument()
    expect(within(panel).queryByText(/choose Comment/)).not.toBeInTheDocument()
    expect(within(panel).getByText(/will appear here/)).toBeInTheDocument()
  })

  it('says it could not load them, and loads them when the person tries again', async () => {
    const user = userEvent.setup()
    let failures = 1
    renderCommentedDocument({
      wrap: (dataSource) => ({
        ...dataSource,
        listThreads: async (request) => {
          if (failures-- > 0)
            throw new ApiError({ type: 'about:blank', title: 'x', status: 500, code: 'internal-error' })
          return dataSource.listThreads(request)
        },
      }),
    })
    const panel = await findPanel()

    expect(await within(panel).findByRole('alert')).toHaveTextContent("We couldn't load the comments")
    await user.click(within(panel).getByRole('button', { name: 'Try again' }))

    expect(await within(panel).findAllByRole('article')).not.toHaveLength(0)
    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('tells a failure of the network from one of the server only by what it does: it can be tried again', async () => {
    renderCommentedDocument({
      wrap: threadsThat(async () => {
        throw new TransportError(null)
      }),
    })
    const panel = await findPanel()

    expect(await within(panel).findByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('lets a reader read the conversation and says that they cannot write', async () => {
    renderCommentedDocument({ signedInAs: people.daniel, documentId: budget.id })
    const panel = await findPanel()

    expect(await within(panel).findByText('You can read the comments but not write them.')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /Comment/ })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('open and resolved threads, with a filter', () => {
  it('lists the open threads first and counts each choice of the filter', async () => {
    renderCommentedDocument()
    const panel = await findPanel()

    const choices = await within(panel).findAllByRole('button', { name: /^(Open|Resolved|All) \(/ })
    expect(choices.map((choice) => [choice.textContent, choice.getAttribute('aria-pressed')])).toEqual([
      ['Open (1)', 'true'],
      ['Resolved (1)', 'false'],
      ['All (2)', 'false'],
    ])
    expect(within(panel).getAllByRole('article')).toHaveLength(1)
    expect(within(panel).getByText('Who signs it off? Finance has not seen the new tiers yet.')).toBeInTheDocument()
  })

  it('shows the resolved ones, with their marker, when the filter says so', async () => {
    const user = userEvent.setup()
    renderCommentedDocument()
    const panel = await findPanel()

    await user.click(await within(panel).findByRole('button', { name: /^Resolved \(/ }))

    const card = within(panel).getByRole('article')
    expect(card).toHaveAttribute('data-state', 'resolved')
    expect(within(card).getByText('Resolved')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Reopen' })).toBeInTheDocument()
  })

  it('shows all of them together', async () => {
    const user = userEvent.setup()
    renderCommentedDocument()
    const panel = await findPanel()

    await user.click(await within(panel).findByRole('button', { name: /^All \(/ }))

    expect(within(panel).getAllByRole('article')).toHaveLength(2)
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
    const panel = await findPanel()

    expect(await within(panel).findByText('No open comments')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Open (0)' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(panel).queryByRole('article')).not.toBeInTheDocument()
  })
})

describe('what the panel says when an action on a thread is refused', () => {
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
      const panel = await findPanel()
      const card = await within(panel).findByRole('article')

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
