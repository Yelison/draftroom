import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { daniel, marta, sofia } from '../../data/mock/fixtures/index.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { renderScreen } from '../../features/documents/testing/renderScreen.tsx'

const rail = () => screen.getByRole('navigation', { name: 'Main navigation' })

describe('the navigation rail', () => {
  beforeEach(() => localStorage.clear())

  it('opens with the workspace and the role of the person in it, and closes with the person', async () => {
    renderScreen('/documents')

    const workspace = await within(rail()).findByTitle('Harbor Pine')
    expect(within(workspace).getByText('Harbor Pine')).toBeInTheDocument()
    expect(within(workspace).getByText('Owner')).toBeInTheDocument()
    expect(within(workspace).getByText('H')).toHaveAttribute('aria-hidden', 'true')
    const person = within(rail()).getByTitle(marta.name ?? '')
    expect(within(person).getByText(marta.name ?? '')).toBeInTheDocument()
  })

  it('offers Home, Documents, Shared, History and Members, with Settings and Sign out in the menu of the person', async () => {
    renderScreen('/documents')

    expect(
      within(rail())
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Home', 'Documents', 'Shared', 'History', 'Members'])
    expect(await within(rail()).findByText('Owner')).toBeInTheDocument()
  })

  it('has one button only, the person, who opens the menu of the account', async () => {
    renderScreen('/documents')
    await within(rail()).findByText('Owner')

    const buttons = within(rail()).getAllByRole('button')

    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAccessibleName(marta.name ?? '')
  })

  it('says a member is a member', async () => {
    renderScreen('/documents', { signedInAs: sofia.email })

    expect(await within(rail()).findByText('Member')).toBeInTheDocument()
    expect(within(rail()).getByText(sofia.name ?? '')).toBeInTheDocument()
  })

  it('keeps the names for the title and for a screen reader on the compact rail of the editor', async () => {
    renderScreen('/documents/new')

    const workspace = await within(rail()).findByTitle('Harbor Pine')
    expect(workspace).toHaveTextContent('Harbor Pine')
    expect(workspace).toHaveTextContent('Owner')
    expect(within(rail()).getByTitle(marta.name ?? '')).toHaveTextContent(marta.name ?? '')
  })

  it('is said in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/documents')

    const spanishRail = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(await within(spanishRail).findByText('Propietario')).toBeInTheDocument()
    expect(within(spanishRail).getByRole('link', { name: 'Miembros' })).toBeInTheDocument()
  })

  it('follows the role of the person when they step down, without leaving the page', async () => {
    const { user } = renderScreen('/members')
    await within(rail()).findByText('Owner')
    const main = screen.getByRole('main')
    const row = await within(main).findByRole('row', { name: new RegExp(daniel.name ?? '') })
    await user.selectOptions(within(row).getByRole('combobox'), 'Owner')
    await within(main).findByText(`The role of ${daniel.name} is now Owner.`)

    await user.selectOptions(
      within(within(main).getByRole('row', { name: /Marta Ruiz/ })).getByRole('combobox'),
      'Member',
    )

    expect(await within(rail()).findByText('Member')).toBeInTheDocument()
    expect(within(rail()).queryByText('Owner')).not.toBeInTheDocument()
  })
})
