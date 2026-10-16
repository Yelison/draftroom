import { syncStates, type SyncState } from '@draftroom/contract/collab'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppProviders } from '../../app/AppProviders.tsx'
import { localeStorageKey } from '../../i18n/locale.ts'
import { SyncStatus } from './SyncStatus.tsx'

const inApp = (state: SyncState, keepsCopy = true) => (
  <AppProviders>
    <SyncStatus state={state} keepsCopy={keepsCopy} />
  </AppProviders>
)

const labels: Record<'en' | 'es', Record<SyncState, string>> = {
  en: {
    connecting: 'Connecting',
    synchronising: 'Synchronising',
    synced: 'Synced',
    'offline-local': 'Offline with local copy',
    reconnecting: 'Reconnecting',
    error: 'Error',
    revoked: 'Access removed',
    'read-only': 'Read-only',
  },
  es: {
    connecting: 'Conectando',
    synchronising: 'Sincronizando',
    synced: 'Sincronizado',
    'offline-local': 'Sin conexión, con copia local',
    reconnecting: 'Reconectando',
    error: 'Error',
    revoked: 'Acceso retirado',
    'read-only': 'Solo lectura',
  },
}

describe('the sync status', () => {
  it.each(syncStates)('says %s in English in a live region', (state) => {
    render(inApp(state))

    expect(screen.getByRole('status')).toHaveTextContent(`Sync status: ${labels.en[state]}`)
  })

  it.each(syncStates)('says %s in Spanish', (state) => {
    localStorage.setItem(localeStorageKey, 'es')

    render(inApp(state))

    expect(screen.getByRole('status')).toHaveTextContent(`Estado de la sincronización: ${labels.es[state]}`)
  })

  // Without a copy what is written offline is only in the tab, and the notice over the sheet says so: the pill and its live
  // region must not say the opposite, least of all to someone who hears them and does not see the notice.
  it.each([
    { language: 'English', locale: 'en', region: 'Sync status: Offline, no local copy' },
    { language: 'Spanish', locale: 'es', region: 'Estado de la sincronización: Sin conexión, sin copia local' },
  ])('says in $language that nothing is kept on the device when offline without a copy', ({ locale, region }) => {
    localStorage.setItem(localeStorageKey, locale)

    render(inApp('offline-local', false))

    expect(screen.getByRole('status')).toHaveTextContent(region)
    expect(screen.getByRole('status')).not.toHaveTextContent(/with local copy|con copia local|saved|guardad/i)
  })

  it.each(syncStates.filter((state) => state !== 'offline-local'))(
    'says %s the same with or without a copy: only offline depends on it',
    (state) => {
      render(inApp(state, false))

      expect(screen.getByRole('status')).toHaveTextContent(`Sync status: ${labels.en[state]}`)
    },
  )

  it('never calls a local copy synced or saved', () => {
    render(inApp('offline-local'))

    expect(screen.getByRole('status')).not.toHaveTextContent(/synced|saved/i)
  })

  it('announces a change of state once, and nothing when it renders again in the same state', () => {
    const { rerender } = render(inApp('synced'))
    const region = screen.getByRole('status')
    const changes = new MutationObserver(() => {})
    changes.observe(region, { childList: true, characterData: true, subtree: true })

    for (let keystroke = 0; keystroke < 20; keystroke += 1) rerender(inApp('synced'))
    expect(changes.takeRecords()).toHaveLength(0)

    rerender(inApp('synchronising'))
    expect(changes.takeRecords()).toHaveLength(1)
    expect(region).toHaveTextContent('Sync status: Synchronising')
    changes.disconnect()
  })

  it('is the same region before and after a change, so the change is announced and not mounted', () => {
    const { rerender } = render(inApp('synced'))
    const before = screen.getByRole('status')

    rerender(inApp('error'))

    expect(screen.getByRole('status')).toBe(before)
  })

  // The label is drawn in a cell that holds every label of the language, so the width is the longest one's and nothing
  // beside it moves when the state changes. Layout is the browser's: the end-to-end suite measures it.
  it('lays every label out in one cell, and draws only the current one', () => {
    const { container } = render(inApp('reconnecting'))

    const drawn = [...container.querySelectorAll('[aria-hidden="true"] > span')]
    expect(drawn.map((label) => label.textContent).sort()).toEqual(
      [...Object.values(labels.en), 'Offline, no local copy'].sort(),
    )
    expect(drawn.filter((label) => label.className.includes('current')).map((label) => label.textContent)).toEqual([
      'Reconnecting',
    ])
  })
})
