import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { main, openTab, renderScreen } from './testing/openSettings.tsx'

const tab = (name: string) => screen.getByRole('tab', { name })

describe('the Settings screen', () => {
  it('offers the four tabs under one headline, with the one of the address selected', async () => {
    await openTab('workspace', 'Workspace')

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(within(screen.getByRole('tablist', { name: 'Settings sections' })).getAllByRole('tab')).toHaveLength(4)
    expect(tab('Workspace')).toHaveAttribute('aria-selected', 'true')
  })

  it('moves along the tabs with the arrow keys, keeping the focus on the tab and following with the address and the panel', async () => {
    const { user, router } = await openTab('profile', 'Profile')
    tab('Profile').focus()

    await user.keyboard('{ArrowRight}')

    expect(await within(main()).findByRole('heading', { level: 2, name: 'Workspace' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/settings/workspace')
    expect(tab('Workspace')).toHaveFocus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(await within(main()).findByRole('heading', { level: 2, name: 'Appearance' })).toBeInTheDocument()
    expect(tab('Appearance')).toHaveFocus()
  })

  it('shows only the panel of the selected tab, and the way into it from the tab is one stop of the keyboard', async () => {
    const { user } = await openTab('profile', 'Profile')
    tab('Profile').focus()

    await user.tab()

    expect(screen.getByRole('tabpanel', { name: 'Profile' })).toHaveFocus()
    expect(screen.getAllByRole('tabpanel', { hidden: true }).filter((panel) => !panel.hidden)).toHaveLength(1)
  })

  it('goes back to the previous tab with the back button', async () => {
    const { user, router } = await openTab('profile', 'Profile')
    await user.click(tab('Members'))
    await within(main()).findByRole('heading', { level: 2, name: 'Members' })

    await router.navigate(-1)

    expect(await within(main()).findByRole('heading', { level: 2, name: 'Profile' })).toBeInTheDocument()
  })

  it('writes the tabs in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/settings/profile')

    expect(await screen.findByRole('tablist', { name: 'Secciones de ajustes' })).toBeInTheDocument()
    expect(tab('Perfil')).toBeInTheDocument()
    expect(tab('Espacio')).toBeInTheDocument()
    expect(tab('Miembros')).toBeInTheDocument()
    expect(tab('Apariencia')).toBeInTheDocument()
  })
})
