import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '../../app/AppProviders.tsx'
import type { Outcome } from '../../components/CommentCard/outcome.ts'
import { NewThreadComposer, type Draft } from './NewThreadComposer.tsx'

function Harness({ onSubmit }: { onSubmit: (draft: Draft) => Promise<Outcome> }) {
  const [draft, setDraft] = useState<Draft>({ anchor: { start: 'AA==', end: 'AA==' }, quote: 'second week', body: '' })
  return (
    <AppProviders>
      <NewThreadComposer
        draft={draft}
        focusRequest={0}
        onChange={(body) => setDraft({ ...draft, body })}
        onSubmit={onSubmit}
        onCancel={() => undefined}
      />
    </AppProviders>
  )
}

describe('the form of a new thread', () => {
  it('sends the thread once when the key that sends is pressed twice before the server answers', async () => {
    const onSubmit = vi.fn(() => new Promise<Outcome>(() => undefined))
    const user = userEvent.setup()
    render(<Harness onSubmit={onSubmit} />)

    await user.type(screen.getByRole('textbox', { name: 'Your comment' }), 'Is this date final?')
    await user.keyboard('{Control>}{Enter}{Enter}{/Control}')

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
