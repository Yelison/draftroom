import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { dialog, openSettings, refusal, renderScreen } from './testing/openSettings.tsx'

const nameField = () => within(dialog()).getByRole('textbox', { name: 'Name' })
const save = () => within(dialog()).getByRole('button', { name: 'Save changes' })

describe('the Profile section', () => {
  it('shows the name, the email and the language of the person', async () => {
    await openSettings()

    expect(nameField()).toHaveValue('Marta Ruiz')
    expect(within(dialog()).getByRole('textbox', { name: 'Email' })).toHaveValue('marta@harborpine.example')
    expect(within(dialog()).getByRole('radio', { name: 'English' })).toBeChecked()
  })

  it('saves a new name, says so, and the account serves it afterwards', async () => {
    const { user, server } = await openSettings()

    await user.clear(nameField())
    await user.type(nameField(), 'Marta Ruiz Vega')
    await user.click(save())

    expect(await within(dialog()).findByText('Changes saved')).toHaveAttribute('role', 'status')
    const me = await server.connect({ signedInAs: 'marta@harborpine.example' }).getMe()
    expect(me.name).toBe('Marta Ruiz Vega')
  })

  it('does not say a change was saved before the server has answered', async () => {
    let answer: () => void = () => undefined
    const { user } = await openSettings({
      wrap: (dataSource) => ({
        ...dataSource,
        updateMe: (request) => new Promise((resolve) => (answer = () => resolve(dataSource.updateMe(request)))),
      }),
    })

    await user.type(nameField(), ' Vega')
    await user.click(save())

    expect(within(dialog()).queryByText('Changes saved')).not.toBeInTheDocument()
    answer()
    expect(await within(dialog()).findByText('Changes saved')).toBeInTheDocument()
  })

  it('asks for a name when it is left empty, and sends nothing', async () => {
    let calls = 0
    const { user } = await openSettings({
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

    expect(await within(dialog()).findByText('Enter your name.')).toBeInTheDocument()
    expect(nameField()).toBeInvalid()
    expect(calls).toBe(0)
  })

  it('counts the name in code points: 81 emoji are too long, 80 are not', async () => {
    const { user } = await openSettings()

    await user.clear(nameField())
    await user.paste('😀'.repeat(81))
    await user.click(save())
    expect(await within(dialog()).findByText('A name can have up to 80 characters.')).toBeInTheDocument()

    await user.clear(nameField())
    await user.paste('😀'.repeat(80))
    await user.click(save())
    expect(await within(dialog()).findByText('Changes saved')).toBeInTheDocument()
  })

  it('says what went wrong when the server refuses, in the language of the app, and keeps what was typed', async () => {
    const { user } = await openSettings({
      wrap: (dataSource) => ({ ...dataSource, updateMe: () => Promise.reject(refusal(503, 'unavailable')) }),
    })

    await user.type(nameField(), ' Vega')
    await user.click(save())

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Draftroom is unavailable right now.')
    expect(nameField()).toHaveValue('Marta Ruiz Vega')
    expect(within(dialog()).queryByText('Changes saved')).not.toBeInTheDocument()
  })

  it('saves the language on the account and switches the app to it', async () => {
    const { user } = await openSettings()

    await user.click(within(dialog()).getByRole('radio', { name: 'Español' }))
    await user.click(save())

    expect(await screen.findByRole('heading', { level: 2, name: 'Perfil' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('es')
    expect(localStorage.getItem(localeStorageKey)).toBe('es')
  })

  it('does not count the language in use as a change, and saves it once the person chooses it', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    const { user, server } = renderScreen('/?settings=profile')
    const spanish = within(await screen.findByRole('dialog', { name: 'Configuración' }))
    await spanish.findByRole('heading', { level: 2, name: 'Perfil' })
    expect(spanish.getByRole('radio', { name: 'Español' })).toBeChecked()
    expect(spanish.getByRole('button', { name: 'Guardar cambios' })).toHaveAttribute('aria-disabled', 'true')

    await user.click(spanish.getByRole('radio', { name: 'English' }))
    await user.click(spanish.getByRole('radio', { name: 'Español' }))
    await user.click(spanish.getByRole('button', { name: 'Guardar cambios' }))

    expect(await spanish.findByText('Cambios guardados')).toBeInTheDocument()
    expect((await server.connect({ signedInAs: 'marta@harborpine.example' }).getMe()).locale).toBe('es')
  })

  it('shows its fields empty and inert, with a spoken status, while the account is on its way', async () => {
    renderScreen('/?settings=profile', {
      wrap: (dataSource) => ({ ...dataSource, getMe: () => new Promise(() => undefined) }),
    })

    expect(await within(dialog()).findByText('Loading your settings')).toHaveAttribute('role', 'status')
    expect(within(dialog()).getByRole('textbox', { name: 'Name' })).toHaveValue('')
    expect(dialog().querySelector('form')).toHaveAttribute('inert')
    expect(dialog().querySelector('form')).toHaveAttribute('aria-busy', 'true')
  })

  it('says it could not read the account, and tries again when asked', async () => {
    let failures = 1
    const { user } = renderScreen('/?settings=profile', {
      wrap: (dataSource) => ({
        ...dataSource,
        getMe: () => (failures-- > 0 ? Promise.reject(refusal(503, 'unavailable')) : dataSource.getMe()),
      }),
    })

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent("We couldn't load your settings")
    await user.click(within(dialog()).getByRole('button', { name: 'Try again' }))

    expect(await within(dialog()).findByRole('heading', { level: 2, name: 'Profile' })).toBeInTheDocument()
    expect(within(dialog()).queryByRole('alert')).not.toBeInTheDocument()
  })
})
