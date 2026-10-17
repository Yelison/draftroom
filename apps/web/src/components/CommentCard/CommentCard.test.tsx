import type { Schema } from '@draftroom/contract'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { AppProviders } from '../../app/AppProviders.tsx'
import { localeStorageKey } from '../../i18n/locale.ts'
import { CommentCard, type CommentCardActions, type CommentCardProps, type CommentCardState } from './CommentCard.tsx'
import { succeeded, type Outcome } from './outcome.ts'

const sofia = { id: 'user-sofia', name: 'Sofía Marín' }
const marta = { id: 'user-marta', name: 'Marta Ruiz' }

const comment = (id: string, author: Schema<'UserRef'>, body: string, updatedAt?: string): Schema<'Comment'> => ({
  id,
  threadId: 'thread-1',
  author,
  body,
  createdAt: '2026-11-03T12:00:00.000Z',
  updatedAt: updatedAt ?? '2026-11-03T12:00:00.000Z',
})

const thread = (comments: Schema<'Comment'>[]): Schema<'Thread'> => ({
  id: 'thread-1',
  documentId: 'document-1',
  status: 'open',
  anchor: { start: 'AQAKAA==', end: 'AQAYAQ==' },
  quote: 'once the pricing review is signed off',
  createdBy: sofia,
  createdAt: '2026-11-03T12:00:00.000Z',
  resolvedAt: null,
  resolvedBy: null,
  comments,
})

const conversation = thread([
  comment('c1', sofia, 'Who signs it off?'),
  comment('c2', marta, 'I will ask on Thursday.'),
])

const failed: Outcome = { ok: false, message: 'We could not reach the server.' }

function actionsThat(outcome: Outcome = succeeded): { [K in keyof CommentCardActions]: Mock<CommentCardActions[K]> } {
  return {
    reply: vi.fn(async () => outcome),
    resolve: vi.fn(async () => outcome),
    reopen: vi.fn(async () => outcome),
    edit: vi.fn(async () => outcome),
    remove: vi.fn(async () => outcome),
  }
}

function renderCard(props: Partial<CommentCardProps> = {}, actions = actionsThat(), locale = 'en') {
  localStorage.setItem(localeStorageKey, locale)
  const user = userEvent.setup()
  const view = render(
    <AppProviders>
      <CommentCard
        thread={conversation}
        state="open"
        mayComment
        mayEdit={(row) => row.author.id === marta.id}
        mayDelete={(row) => row.author.id === marta.id}
        actions={actions}
        {...props}
      />
    </AppProviders>,
  )
  return { user, actions, ...view }
}

describe('the states of a card', () => {
  const states: { state: CommentCardState; marker: string | null }[] = [
    { state: 'open', marker: null },
    { state: 'resolved', marker: 'Resolved' },
    { state: 'orphaned', marker: 'Text removed' },
  ]

  it.each(states)('says what the $state state is, and always quotes the text it is about', ({ state, marker }) => {
    renderCard({ state })

    const card = screen.getByRole('article', { name: 'Comment thread by Sofía Marín' })
    expect(card).toHaveAttribute('data-state', state)
    expect(within(card).getByText('once the pricing review is signed off')).toBeInTheDocument()
    if (marker === null) expect(within(card).queryByText(/^(Resolved|Text removed)$/)).not.toBeInTheDocument()
    else expect(within(card).getByText(marker)).toBeInTheDocument()
  })

  it('tells an orphaned thread from one on the text, which is the only one that can be shown in it', () => {
    const onShowInText = vi.fn()
    const { rerender } = renderCard({ state: 'orphaned', onShowInText })

    expect(screen.getByText(/no longer in the document/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show in text' })).not.toBeInTheDocument()

    rerender(
      <AppProviders>
        <CommentCard
          thread={conversation}
          state="open"
          mayComment
          mayEdit={() => false}
          mayDelete={() => false}
          actions={actionsThat()}
          onShowInText={onShowInText}
        />
      </AppProviders>,
    )
    expect(screen.getByRole('button', { name: 'Show in text' })).toBeInTheDocument()
  })

  it('can be answered and resolved when it is orphaned', async () => {
    const { user, actions } = renderCard({ state: 'orphaned' })

    await user.type(screen.getByRole('textbox', { name: 'Reply to this thread' }), 'Noted')
    await user.click(screen.getByRole('button', { name: 'Reply' }))
    await user.click(screen.getByRole('button', { name: 'Resolve' }))

    expect(actions.reply).toHaveBeenCalledWith('Noted')
    expect(actions.resolve).toHaveBeenCalledOnce()
  })

  it('offers to reopen a resolved thread, and no reply', async () => {
    const { user, actions } = renderCard({ state: 'resolved' })

    expect(screen.queryByRole('textbox', { name: 'Reply to this thread' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reopen' }))

    expect(actions.reopen).toHaveBeenCalledOnce()
  })

  it('marks the thread the person is on', () => {
    renderCard({ active: true })

    expect(screen.getByRole('article')).toHaveAttribute('aria-current', 'true')
  })
})

describe('a reader of the document', () => {
  it('sees the conversation and nothing to do with it', () => {
    renderCard({ mayComment: false, mayEdit: () => false, mayDelete: () => false })

    expect(screen.getByText('Who signs it off?')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('who may change a comment', () => {
  it('offers edit and delete on the comments the props allow, and on those alone', () => {
    renderCard({ mayEdit: (row) => row.id === 'c2', mayDelete: (row) => row.id === 'c1' })

    expect(screen.getAllByRole('button', { name: /^Edit the comment/ }).map((button) => button.ariaLabel)).toEqual([
      'Edit the comment by Marta Ruiz',
    ])
    expect(screen.getAllByRole('button', { name: /^Delete the comment/ }).map((button) => button.ariaLabel)).toEqual([
      'Delete the comment by Sofía Marín',
    ])
  })
})

describe('the dates', () => {
  it.each([
    { locale: 'en', written: /Nov 3, 2026/ },
    { locale: 'es', written: /3 nov 2026/ },
  ])('are written for the language of the person ($locale)', ({ locale, written }) => {
    renderCard({}, actionsThat(), locale)

    const times = screen.getAllByText(written)
    expect(times[0]?.tagName).toBe('TIME')
    expect(times[0]).toHaveAttribute('datetime', '2026-11-03T12:00:00.000Z')
  })

  it('say that a comment was edited, in the language of the person', () => {
    const edited = thread([comment('c1', marta, 'Fixed it', '2026-11-04T09:00:00.000Z')])
    renderCard({ thread: edited }, actionsThat(), 'es')

    expect(screen.getByText('editado')).toBeInTheDocument()
  })
})

describe('replying', () => {
  it('sends the text without the blanks around it, empties the field and keeps the focus in it', async () => {
    const { user, actions } = renderCard()
    const field = screen.getByRole('textbox', { name: 'Reply to this thread' })

    await user.type(field, '  Thursday works  ')
    await user.click(screen.getByRole('button', { name: 'Reply' }))

    expect(actions.reply).toHaveBeenCalledWith('Thursday works')
    expect(field).toHaveValue('')
    expect(field).toHaveFocus()
  })

  it('sends with Ctrl+Enter', async () => {
    const { user, actions } = renderCard()

    await user.type(screen.getByRole('textbox', { name: 'Reply to this thread' }), 'Thursday works{Control>}{Enter}')

    expect(actions.reply).toHaveBeenCalledWith('Thursday works')
  })

  it('asks for something to send, without calling the server', async () => {
    const { user, actions } = renderCard()

    await user.click(screen.getByRole('button', { name: 'Reply' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Write something before you send it.')
    expect(actions.reply).not.toHaveBeenCalled()
  })

  it('refuses more than 5 000 characters', async () => {
    const { user, actions } = renderCard()
    await user.click(screen.getByRole('textbox', { name: 'Reply to this thread' }))
    await user.paste('😀'.repeat(5001))

    await user.click(screen.getByRole('button', { name: 'Reply' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('the limit is 5,000 characters')
    expect(actions.reply).not.toHaveBeenCalled()
  })

  it('counts characters, not UTF-16 units: 3 000 emoji are 6 000 units and fit', async () => {
    const { user, actions } = renderCard()
    await user.click(screen.getByRole('textbox', { name: 'Reply to this thread' }))
    await user.paste('😀'.repeat(3000))

    await user.click(screen.getByRole('button', { name: 'Reply' }))

    expect(actions.reply).toHaveBeenCalledOnce()
  })

  it('keeps what was written and says why it did not go', async () => {
    const { user } = renderCard({}, actionsThat(failed))
    const field = screen.getByRole('textbox', { name: 'Reply to this thread' })

    await user.type(field, 'Thursday works')
    await user.click(screen.getByRole('button', { name: 'Reply' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not reach the server.')
    expect(field).toHaveValue('Thursday works')
  })
})

describe('editing a comment', () => {
  it('puts the focus in the field, saves the change and gives the focus back to the button', async () => {
    const { user, actions } = renderCard()

    await user.click(screen.getByRole('button', { name: 'Edit the comment by Marta Ruiz' }))
    const field = screen.getByRole('textbox', { name: 'Edit the comment by Marta Ruiz' })
    expect(field).toHaveFocus()
    expect(field).toHaveValue('I will ask on Thursday.')
    await user.clear(field)
    await user.type(field, 'I asked, Thursday at ten.')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(actions.edit).toHaveBeenCalledWith('c2', 'I asked, Thursday at ten.')
    expect(screen.getByRole('button', { name: 'Edit the comment by Marta Ruiz' })).toHaveFocus()
  })

  it('gives the focus back to the button when the person cancels', async () => {
    const { user, actions } = renderCard()

    await user.click(screen.getByRole('button', { name: 'Edit the comment by Marta Ruiz' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(actions.edit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Edit the comment by Marta Ruiz' })).toHaveFocus()
  })

  it('stays in the field with the text, and says why, when the server refuses it', async () => {
    const { user } = renderCard({}, actionsThat(failed))

    await user.click(screen.getByRole('button', { name: 'Edit the comment by Marta Ruiz' }))
    const field = screen.getByRole('textbox', { name: 'Edit the comment by Marta Ruiz' })
    await user.type(field, ' Really.')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not reach the server.')
    expect(field).toHaveValue('I will ask on Thursday. Really.')
  })
})

describe('deleting a comment', () => {
  it('asks first, with the focus on the safe answer, and deletes when the person confirms', async () => {
    const { user, actions } = renderCard()

    await user.click(screen.getByRole('button', { name: 'Delete the comment by Marta Ruiz' }))
    const confirmation = screen.getByRole('group', { name: 'Delete comment' })
    expect(within(confirmation).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(actions.remove).not.toHaveBeenCalled()
    await user.click(within(confirmation).getByRole('button', { name: 'Delete comment' }))

    expect(actions.remove).toHaveBeenCalledWith('c2')
  })

  it('gives the focus back to the button that asked when the person changes their mind', async () => {
    const { user, actions } = renderCard()

    await user.click(screen.getByRole('button', { name: 'Delete the comment by Marta Ruiz' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(actions.remove).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete the comment by Marta Ruiz' })).toHaveFocus()
  })

  it('says that the thread goes with the only comment it has', async () => {
    const alone = thread([comment('c1', marta, 'Only me')])
    const { user } = renderCard({ thread: alone })

    await user.click(screen.getByRole('button', { name: 'Delete the comment by Marta Ruiz' }))

    expect(screen.getByText(/so the thread goes with it/)).toBeInTheDocument()
  })

  it('says why it was not deleted, and stays', async () => {
    const { user } = renderCard({}, actionsThat(failed))

    await user.click(screen.getByRole('button', { name: 'Delete the comment by Marta Ruiz' }))
    await user.click(screen.getByRole('button', { name: 'Delete comment' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not reach the server.')
    expect(screen.getByRole('group', { name: 'Delete comment' })).toBeInTheDocument()
  })
})

describe('resolving a thread that the server refuses', () => {
  it('says so, in a way a screen reader hears', async () => {
    const { user } = renderCard({}, actionsThat(failed))

    await user.click(screen.getByRole('button', { name: 'Resolve' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not reach the server.')
  })
})
