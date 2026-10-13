import { Button } from '@yelison/forma-ui'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../i18n/locale.ts'
import { AppProviders } from './AppProviders.tsx'

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
})
