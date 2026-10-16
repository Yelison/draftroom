import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '../../app/AppProviders.tsx'
import { localeStorageKey } from '../../i18n/locale.ts'
import type { CollabSnapshot } from '../../collab/session.ts'
import { SyncAlerts } from './SyncAlerts.tsx'

type Shown = Pick<CollabSnapshot, 'state' | 'editable' | 'cause' | 'action' | 'notice'>

const nothing: Shown = { state: 'synced', editable: true, cause: null, action: null, notice: null }

function show(snapshot: Partial<Shown>) {
  const handlers = { onRetry: vi.fn(), onDiscard: vi.fn(), onDismissNotice: vi.fn() }
  render(
    <AppProviders>
      <SyncAlerts snapshot={{ ...nothing, ...snapshot }} {...handlers} />
    </AppProviders>,
  )
  return { ...handlers, user: userEvent.setup() }
}

describe('what is said about the changes when the connection has a problem', () => {
  it('says nothing when there is none', () => {
    const { container } = render(
      <AppProviders>
        <SyncAlerts snapshot={nothing} onRetry={vi.fn()} onDiscard={vi.fn()} onDismissNotice={vi.fn()} />
      </AppProviders>,
    )

    expect(container.querySelector('[role]')).toBeNull()
  })

  it.each([
    { cause: 'store-timeout', title: "We can't confirm that your latest changes are stored" },
    { cause: 'unauthenticated', title: 'Your session ended' },
    { cause: 'not-found', title: "We couldn't open this document" },
  ] as const)('offers a retry for $cause, and presses it once', async ({ cause, title }) => {
    const { user, onRetry, onDiscard } = show({ cause, action: 'retry', notice: null })

    expect(screen.getByText(title)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onDiscard).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Discard my local changes and reload' })).not.toBeInTheDocument()
  })

  it('offers only to discard the local changes and reload, never a retry, for a document that is too large', async () => {
    const { user, onRetry, onDiscard } = show({
      cause: 'document-too-large',
      action: 'discard-and-reload',
      notice: null,
    })

    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Discard my local changes and reload' }))

    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('tells the person that what they wrote offline was not kept, and lets them dismiss it', async () => {
    const { user, onDismissNotice } = show({ cause: null, action: null, notice: 'offline-changes-discarded' })

    expect(screen.getByText("Your offline changes weren't kept")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(onDismissNotice).toHaveBeenCalledTimes(1)
  })

  it('tells the person that what they write while offline is on this device only', () => {
    show({ state: 'offline-local' })

    expect(screen.getByText("You're working offline")).toBeInTheDocument()
    expect(screen.getByText(/stays on this device until you're back online/)).toBeInTheDocument()
    // It is a notice, not a way to say it is saved, and there is nothing for the person to press.
    expect(screen.queryByText(/saved|synced/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it.each([
    {
      case: 'a reader who is offline, who has nothing of their own on the device',
      shown: { state: 'offline-local', editable: false },
    },
    { case: 'a connection that is up', shown: { state: 'synced' } },
    { case: 'a reconnection', shown: { state: 'reconnecting' } },
  ] as const)('does not say it for $case', ({ shown }) => {
    const { container } = render(
      <AppProviders>
        <SyncAlerts
          snapshot={{ ...nothing, ...shown }}
          onRetry={vi.fn()}
          onDiscard={vi.fn()}
          onDismissNotice={vi.fn()}
        />
      </AppProviders>,
    )

    expect(container.querySelector('[role]')).toBeNull()
    expect(screen.queryByText("You're working offline")).not.toBeInTheDocument()
  })

  it('says it in Spanish', () => {
    localStorage.setItem(localeStorageKey, 'es')
    show({
      state: 'offline-local',
      cause: 'document-too-large',
      action: 'discard-and-reload',
      notice: 'offline-changes-discarded',
    })

    expect(screen.getByText('Este documento es demasiado grande para seguir editándolo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descartar mis cambios locales y recargar' })).toBeInTheDocument()
    expect(screen.getByText('Tus cambios sin conexión no se conservaron')).toBeInTheDocument()
    expect(screen.getByText('Estás trabajando sin conexión')).toBeInTheDocument()
  })
})
