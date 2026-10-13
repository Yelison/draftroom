import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { localeStorageKey } from '../i18n/locale.ts'
import { renderApp } from '../test/renderApp.tsx'

describe('the home route', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    {
      locale: 'en',
      heading: 'Write together, without losing a word',
      action: 'New document',
      title: 'Home · Draftroom',
    },
    {
      locale: 'es',
      heading: 'Escribe en equipo, sin perder una palabra',
      action: 'Nuevo documento',
      title: 'Inicio · Draftroom',
    },
  ])('paints its headline, its action and the tab title in $locale', ({ locale, heading, action, title }) => {
    localStorage.setItem(localeStorageKey, locale)

    renderApp()

    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: action })).toBeInTheDocument()
    expect(document.title).toBe(title)
    expect(document.documentElement.lang).toBe(locale)
  })

  it('opens in the language of the browser when nothing was chosen', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-MX'])

    renderApp()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Escribe en equipo')
  })
})
