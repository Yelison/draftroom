import { Button, Dialog, useFormaStrings } from '@yelison/forma-ui'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../i18n/locale.ts'
import { AppProviders } from './AppProviders.tsx'

/** A dialog with the close button the library leaves to its consumer, named by the library's own string. */
function ClosableDialog() {
  const { dialogClose } = useFormaStrings()
  return <Dialog open onClose={() => {}} title="Notes" footer={<Button>{dialogClose}</Button>} />
}

describe('AppProviders', () => {
  it.each([
    { locale: 'en', loading: 'Loading…' },
    { locale: 'es', loading: 'Cargando…' },
  ])('gives Forma UI its own text in $locale', ({ locale, loading }) => {
    localStorage.setItem(localeStorageKey, locale)

    render(
      <AppProviders>
        <Button loading>Save</Button>
      </AppProviders>,
    )

    expect(screen.getByRole('button', { name: loading })).toBeInTheDocument()
  })

  it.each([
    { locale: 'en', close: 'Close' },
    { locale: 'es', close: 'Cerrar' },
  ])('gives the close button of a Forma UI dialog its text in $locale', ({ locale, close }) => {
    localStorage.setItem(localeStorageKey, locale)

    render(
      <AppProviders>
        <ClosableDialog />
      </AppProviders>,
    )

    expect(screen.getByRole('button', { name: close, hidden: true })).toBeInTheDocument()
  })
})
