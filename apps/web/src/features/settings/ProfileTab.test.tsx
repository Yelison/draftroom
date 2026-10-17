import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { main, openTab, refusal, renderScreen } from './testing/openSettings.tsx'

const nameField = () => within(main()).getByRole('textbox', { name: 'Name' })
const save = () => within(main()).getByRole('button', { name: 'Save changes' })

describe('the Profile tab', () => {
  it('shows the name, the email and the language of the person', async () => {
    await openTab('profile', 'Profile')

    expect(nameField()).toHaveValue('Marta Ruiz')
    expect(within(main()).getByRole('textbox', { name: 'Email' })).toHaveValue('marta@harborpine.example')
    expect(within(main()).getByRole('radio', { name: 'English' })).toBeChecked()
  })

  it('saves a new name, says so, and the account serves it afterwards', async () => {
    const { user, server } = await openTab('profile', 'Profile')

    await user.clear(nameField())
    await user.type(nameField(), 'Marta Ruiz Vega')
    await user.click(save())

    expect(await within(main()).findByText('Changes saved')).toHaveAttribute('role', 'status')
    const me = await server.connect({ signedInAs: 'marta@harborpine.example' }).getMe()
    expect(me.name).toBe('Marta Ruiz Vega')
  })

  it('does not say a change was saved before the server has answered', async () => {
    let answer: () => void = () => undefined
    const { user } = await openTab('profile', 'Profile', {
      wrap: (dataSource) => ({
        ...dataSource,
        updateMe: (request) => new Promise((resolve) => (answer = () => resolve(dataSource.updateMe(request)))),
      }),
    })

    await user.type(nameField(), ' Vega')
    await user.click(save())

    expect(within(main()).queryByText('Changes saved')).not.toBeInTheDocument()
    answer()
    expect(await within(main()).findByText('Changes saved')).toBeInTheDocument()
  })

  it('asks for a name when it is left empty, and sends nothing', async () => {
    let calls = 0
    const { user } = await openTab('profile', 'Profile', {
      wrap: (dataSource) => ({
        ...dataSource,
        updateMe: (request) => {
          calls++
          return dataSource.updateMe(request)
        },
      }),
    })

    await user.clear(nameField())
    await user.click(save())

    expect(await within(main()).findByText('Enter your name.')).toBeInTheDocument()
    expect(nameField()).toBeInvalid()
    expect(calls).toBe(0)
  })

  it('counts the name in code points: 81 emoji are too long, 80 are not', async () => {
    const { user } = await openTab('profile', 'Profile')

    await user.clear(nameField())
    await user.paste('😀'.repeat(81))
    await user.click(save())
    expect(await within(main()).findByText('A name can have up to 80 characters.')).toBeInTheDocument()

    await user.clear(nameField())
    await user.paste('😀'.repeat(80))
    await user.click(save())
    expect(await within(main()).findByText('Changes saved')).toBeInTheDocument()
  })

  it('says what went wrong when the server refuses, in the language of the app, and keeps what was typed', async () => {
    const { user } = await openTab('profile', 'Profile', {
      wrap: (dataSource) => ({ ...dataSource, updateMe: () => Promise.reject(refusal(503, 'unavailable')) }),
    })

    await user.type(nameField(), ' Vega')
    await user.click(save())

    expect(await within(main()).findByRole('alert')).toHaveTextContent('Draftroom is unavailable right now.')
    expect(nameField()).toHaveValue('Marta Ruiz Vega')
    expect(within(main()).queryByText('Changes saved')).not.toBeInTheDocument()
  })

  it('saves the language on the account and switches the app to it', async () => {
    const { user } = await openTab('profile', 'Profile')

    await user.click(within(main()).getByRole('radio', { name: 'Español' }))
    await user.click(save())

    expect(await screen.findByRole('heading', { level: 2, name: 'Perfil' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('es')
    expect(localStorage.getItem(localeStorageKey)).toBe('es')
  })

  it('shows a skeleton with a spoken status while the account is on its way', async () => {
    renderScreen('/settings/profile', {
      wrap: (dataSource) => ({ ...dataSource, getMe: () => new Promise(() => undefined) }),
    })

    expect(await within(main()).findByText('Loading your settings')).toHaveAttribute('role', 'status')
    expect(within(main()).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('says it could not read the account, and tries again when asked', async () => {
    let failures = 1
    const { user } = renderScreen('/settings/profile', {
      wrap: (dataSource) => ({
        ...dataSource,
        getMe: () => (failures-- > 0 ? Promise.reject(refusal(503, 'unavailable')) : dataSource.getMe()),
      }),
    })

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load your settings")
    await user.click(within(main()).getByRole('button', { name: 'Try again' }))

    expect(await within(main()).findByRole('heading', { level: 2, name: 'Profile' })).toBeInTheDocument()
    await waitFor(() => expect(within(main()).queryByRole('alert')).not.toBeInTheDocument())
  })
})
