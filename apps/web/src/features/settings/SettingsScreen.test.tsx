import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { main, openTab, renderScreen } from './testing/openSettings.tsx'

const tab = (name: string) => screen.getByRole('tab', { name })

describe('the Settings screen', () => {
  it('offers the three tabs under one headline, with the one of the address selected', async () => {
    await openTab('workspace', 'Workspace')

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(within(screen.getByRole('tablist', { name: 'Settings sections' })).getAllByRole('tab')).toHaveLength(3)
    expect(tab('Workspace')).toHaveAttribute('aria-selected', 'true')
  })

  it('moves along the tabs with the arrow keys, keeping the focus on the tab and following with the address and the panel', async () => {
    const { user, router } = await openTab('profile', 'Profile')
    tab('Profile').focus()

    await user.keyboard('{ArrowRight}')

    expect(await within(main()).findByRole('heading', { level: 2, name: 'Workspace' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/settings/workspace')
    expect(tab('Workspace')).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(await within(main()).findByRole('heading', { level: 2, name: 'Appearance' })).toBeInTheDocument()
    expect(tab('Appearance')).toHaveFocus()
  })

  it('makes the panel the next stop of the keyboard after the selected tab', async () => {
    const { user } = await openTab('profile', 'Profile')
    tab('Profile').focus()

    await user.tab()

    expect(screen.getByRole('tabpanel', { name: 'Profile' })).toHaveFocus()
  })

  it('goes back to the previous tab with the back button', async () => {
    const { user, router } = await openTab('profile', 'Profile')
    await user.click(tab('Workspace'))
    await within(main()).findByRole('heading', { level: 2, name: 'Workspace' })

    await router.navigate(-1)

    expect(await within(main()).findByRole('heading', { level: 2, name: 'Profile' })).toBeInTheDocument()
  })

  it('writes the tabs in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/settings/profile')

    expect(await screen.findByRole('tablist', { name: 'Secciones de la configuración' })).toBeInTheDocument()
    expect(tab('Perfil')).toBeInTheDocument()
    expect(tab('Espacio')).toBeInTheDocument()
    expect(tab('Apariencia')).toBeInTheDocument()
  })
})
