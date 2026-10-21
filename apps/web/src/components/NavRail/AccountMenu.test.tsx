import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { marta } from '../../data/mock/fixtures/index.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { renderScreen } from '../../features/documents/testing/renderScreen.tsx'

const person = () => screen.findByRole('button', { name: marta.name ?? '' })
const menu = () => screen.findByRole('menu', { name: 'Account' })

describe('the menu of the person in the rail', () => {
  beforeEach(() => localStorage.clear())

  it.each([
    { path: '/documents', rail: 'wide' },
    { path: '/documents/new', rail: 'compact' },
  ])('is a button that says it opens a menu, in the $rail rail', async ({ path }) => {
    renderScreen(path)

    const trigger = await person()

    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it.each([
    { key: '{Enter}', opens: 'Enter' },
    { key: ' ', opens: 'Space' },
    { key: '{ArrowDown}', opens: 'the down arrow' },
  ])('opens with $opens, with Settings and Sign out in it', async ({ key }) => {
    const { user } = renderScreen('/documents')
    const trigger = await person()
    trigger.focus()

    await user.keyboard(key)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(await menu())
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Settings', 'Sign out'])
  })

  it('opens from the compact rail of the editor as well', async () => {
    const { user } = renderScreen('/documents/new')

    await user.click(await person())

    expect(within(await menu()).getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument()
  })

  it('closes with Escape and leaves the focus on the person', async () => {
    const { user } = renderScreen('/documents')
    const trigger = await person()
    await user.click(trigger)
    await menu()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('puts the Settings dialog outside the navigation landmark', async () => {
    const { user } = renderScreen('/documents')
    await user.click(await person())
    await user.click(within(await menu()).getByRole('menuitem', { name: 'Settings' }))

    const dialog = await screen.findByRole('dialog', { name: 'Settings' })

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).not.toContainElement(dialog)
  })

  it('ends the session from Sign out, and the person lands on the sign-in page', async () => {
    const { user, router } = renderScreen('/documents')
    await user.click(await person())

    await user.click(within(await menu()).getByRole('menuitem', { name: 'Sign out' }))

    await screen.findByRole('heading', { level: 1, name: 'Sign in' })
    expect(router.state.location.pathname).toBe('/sign-in')
  })

  it('is said in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    const { user } = renderScreen('/documents')

    await user.click(await person())

    expect(
      within(await screen.findByRole('menu', { name: 'Cuenta' }))
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Configuración', 'Cerrar sesión'])
  })
})
