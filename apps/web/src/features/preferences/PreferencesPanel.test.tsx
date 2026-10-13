import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { AppProviders } from '../../app/AppProviders.tsx'
import { themeStorageKey } from '../../theme.ts'
import { PreferencesPanel } from './PreferencesPanel.tsx'

const renderPanel = () =>
  render(
    <AppProviders>
      <PreferencesPanel />
    </AppProviders>,
  )

describe('the language choice', () => {
  it('is a labelled group with each language named in itself', () => {
    renderPanel()

    const group = screen.getByRole('group', { name: 'Language' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Español' })).not.toBeChecked()
    expect(screen.getByText('Español')).toHaveAttribute('lang', 'es')
  })

  it('switches the language of the page, <html lang> and the choice kept for next time', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('radio', { name: 'Español' }))

    expect(screen.getByRole('radio', { name: 'Español' })).toHaveFocus()
    expect(screen.getByRole('group', { name: 'Idioma' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('es')
    expect(localStorage.getItem(localeStorageKey)).toBe('es')
  })

  it('says the change in the new language', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('radio', { name: 'Español' }))

    expect(screen.getByRole('status')).toHaveTextContent('Idioma cambiado a Español')
  })

  it('can be used with the keyboard', async () => {
    renderPanel()

    await userEvent.tab()
    expect(screen.getByRole('radio', { name: 'English' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')

    expect(screen.getByRole('radio', { name: 'Español' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Español' })).toHaveFocus()
  })
})

describe('the theme choice', () => {
  it('offers light, dark and the system theme, with the system one chosen at first', () => {
    renderPanel()

    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Light' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked()
  })

  it.each([
    { choice: 'Dark', theme: 'dark', announcement: 'Dark theme on' },
    { choice: 'Light', theme: 'light', announcement: 'Light theme on' },
  ])('applies the $theme theme, keeps it and says so', async ({ choice, theme, announcement }) => {
    renderPanel()

    await userEvent.click(screen.getByRole('radio', { name: choice }))

    expect(document.documentElement).toHaveAttribute('data-theme', theme)
    expect(localStorage.getItem(themeStorageKey)).toBe(theme)
    expect(screen.getByRole('status')).toHaveTextContent(announcement)
  })

  it('goes back to the system theme by removing the attribute', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))

    await userEvent.click(screen.getByRole('radio', { name: 'System' }))

    expect(document.documentElement).not.toHaveAttribute('data-theme')
    expect(screen.getByRole('status')).toHaveTextContent('Theme follows the system')
  })

  it('names its options and says its change in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderPanel()

    await userEvent.click(screen.getByRole('radio', { name: 'Oscuro' }))

    expect(screen.getByRole('group', { name: 'Tema' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Tema oscuro activado')
  })
})

describe('the live region', () => {
  it('is on the page and empty before anything changes', () => {
    renderPanel()

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
