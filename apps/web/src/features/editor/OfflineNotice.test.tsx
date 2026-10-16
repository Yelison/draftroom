import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppProviders } from '../../app/AppProviders.tsx'
import type { CollabSnapshot } from '../../collab/session.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { OfflineNotice } from './OfflineNotice.tsx'

type Shown = Pick<CollabSnapshot, 'state' | 'editable' | 'keepsCopy'>

const offline: Shown = { state: 'offline-local', editable: true, keepsCopy: true }

function show(snapshot: Shown) {
  return render(
    <AppProviders>
      <OfflineNotice snapshot={snapshot} />
    </AppProviders>,
  )
}

describe('what is said about where the changes are while the browser is offline', () => {
  it('says that they stay on this device when it keeps a copy, and not that they are saved', () => {
    show(offline)

    expect(
      screen.getByText('Offline: what you write stays on this device until the connection is back.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/saved|synced/i)).not.toBeInTheDocument()
  })

  it('says that they are only in this tab, which has to stay open, when the device keeps no copy', () => {
    show({ ...offline, keepsCopy: false })

    expect(
      screen.getByText('Offline: what you write is only in this tab. Keep it open until the connection is back.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/on this device/)).not.toBeInTheDocument()
  })

  it.each([
    { case: 'a reader, who has nothing of their own to lose', shown: { editable: false } },
    { case: 'a connection that is up', shown: { state: 'synced' } },
    { case: 'a reconnection', shown: { state: 'reconnecting' } },
  ] as const)('says nothing for $case', ({ shown }) => {
    const { container } = show({ ...offline, ...shown })

    expect(container).toBeEmptyDOMElement()
  })

  it('says it in Spanish, in both cases', () => {
    localStorage.setItem(localeStorageKey, 'es')
    const { rerender } = show(offline)
    expect(
      screen.getByText('Sin conexión: lo que escribas se queda en este dispositivo hasta que vuelva la conexión.'),
    ).toBeInTheDocument()

    rerender(
      <AppProviders>
        <OfflineNotice snapshot={{ ...offline, keepsCopy: false }} />
      </AppProviders>,
    )

    expect(
      screen.getByText(
        'Sin conexión: lo que escribas solo está en esta pestaña. No la cierres hasta que vuelva la conexión.',
      ),
    ).toBeInTheDocument()
  })
})
