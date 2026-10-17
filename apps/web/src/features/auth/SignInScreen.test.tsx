import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, TransportError } from '../../data/errors.ts'
import { demoPassword, marta } from '../../data/mock/fixtures/index.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { renderSignedOut } from './testing/renderSignedOut.tsx'

const refusal = (status: number, code: ApiError['code']) =>
  new ApiError({ type: 'about:blank', title: 'Refused', status, code })

const emailField = () => screen.getByRole('textbox', { name: 'Email' })
const passwordField = () => screen.getByLabelText('Password')
const submit = () => screen.getByRole('button', { name: 'Sign in' })

async function open(options?: Parameters<typeof renderSignedOut>[1]) {
  const view = renderSignedOut('/sign-in', options)
  await screen.findByRole('heading', { level: 1, name: 'Sign in' })
  return view
}

describe('the sign-in screen', () => {
  it('has a headline, the two fields with their labels and one button, and names the tab', async () => {
    await open()

    expect(emailField()).toHaveAttribute('autocomplete', 'username')
    expect(passwordField()).toHaveAttribute('type', 'password')
    expect(passwordField()).toHaveAttribute('autocomplete', 'current-password')
    expect(submit()).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Sign in · Draftroom'))
  })

  it('leaves the keyboard on the skip link when it is opened, as every page does', async () => {
    await open()

    expect(document.body).toHaveFocus()
  })

  it('goes to the way to create an account, keeping where the person was going', async () => {
    const { user, router } = renderSignedOut('/search?q=budget')
    await screen.findByRole('heading', { level: 1, name: 'Sign in' })

    await user.click(screen.getByRole('link', { name: 'Create an account' }))

    expect(router.state.location.pathname).toBe('/sign-up')
    expect(router.state.location.state).toEqual({ from: '/search?q=budget' })
  })
})

describe('signing in', () => {
  it('works from the keyboard alone: type the address, Tab, type the password, Enter', async () => {
    const { user, router } = await open()

    await user.type(emailField(), marta.email)
    await user.tab()
    await user.keyboard(demoPassword)
    await user.keyboard('{Enter}')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
  })

  it('takes the address as it was written, in any case and with spaces around it', async () => {
    const { user, router } = await open()

    await user.type(emailField(), `  ${marta.email.toUpperCase()}  `)
    await user.type(passwordField(), demoPassword)
    await user.click(submit())

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('shows that it is working, and sends nothing twice for a second press while it waits', async () => {
    let answer: () => void = () => undefined
    let sent = 0
    const { user } = await open({
      wrap: (dataSource) => ({
        ...dataSource,
        signIn: (request) => {
          sent += 1
          return new Promise((resolve) => (answer = () => resolve(dataSource.signIn(request))))
        },
      }),
    })
    await user.type(emailField(), marta.email)
    await user.type(passwordField(), demoPassword)

    await user.click(submit())
    await user.keyboard('{Enter}')

    expect(sent).toBe(1)
    expect(screen.getByRole('button', { name: 'Loading…' })).toHaveAttribute('aria-busy', 'true')
    answer()
  })
})

describe('what is wrong before anything is sent', () => {
  it('names both fields when they are empty, puts the focus on the first, and sends nothing', async () => {
    const signIn = vi.fn()
    const { user } = await open({ wrap: (dataSource) => ({ ...dataSource, signIn }) })

    await user.click(submit())

    expect(emailField()).toHaveFocus()
    expect(emailField()).toBeInvalid()
    expect(emailField()).toHaveAccessibleDescription('Enter your email.')
    expect(passwordField()).toHaveAccessibleDescription('Enter your password.')
    expect(signIn).not.toHaveBeenCalled()
  })

  it('says an address without an @ is not one, and puts the focus on it', async () => {
    const { user } = await open()
    await user.type(emailField(), 'marta')
    await user.type(passwordField(), demoPassword)

    await user.click(submit())

    expect(emailField()).toHaveFocus()
    expect(emailField()).toHaveAccessibleDescription('Enter an email like name@example.com.')
  })

  it('puts the focus on the password when only that is missing', async () => {
    const { user } = await open()
    await user.type(emailField(), marta.email)

    await user.click(submit())

    expect(passwordField()).toHaveFocus()
  })

  it('says a password over the limit is too long', async () => {
    const { user } = await open()
    await user.type(emailField(), marta.email)
    await user.click(passwordField())
    await user.paste('a'.repeat(129))

    await user.click(submit())

    expect(passwordField()).toHaveAccessibleDescription('A password can have up to 128 characters.')
  })
})

describe('what the server refuses', () => {
  const failWith = (error: Error) => ({
    wrap: (dataSource: Parameters<NonNullable<Parameters<typeof renderSignedOut>[1]>['wrap'] & object>[0]) => ({
      ...dataSource,
      signIn: () => Promise.reject(error),
    }),
  })

  it('says the same thing for a wrong password and for an address with no account, and does not say which', async () => {
    const wrong = await open()
    await wrong.user.type(emailField(), marta.email)
    await wrong.user.type(passwordField(), 'not the password at all')
    await wrong.user.click(submit())
    const forWrong = (await screen.findByRole('alert')).textContent
    wrong.unmount()

    const unknown = await open()
    await unknown.user.type(emailField(), 'nobody@harborpine.example')
    await unknown.user.type(passwordField(), 'not the password at all')
    await unknown.user.click(submit())

    expect(await screen.findByRole('alert')).toHaveTextContent(forWrong ?? '')
    expect(forWrong).toBe('The email or the password is not right. Check them and try again.')
  })

  it('empties the password and puts the focus back on it, keeping the address', async () => {
    const { user } = await open()
    await user.type(emailField(), marta.email)
    await user.type(passwordField(), 'not the password at all')

    await user.click(submit())
    await screen.findByRole('alert')

    expect(passwordField()).toHaveValue('')
    expect(passwordField()).toHaveFocus()
    expect(emailField()).toHaveValue(marta.email)
  })

  it('says it again, as an alert, when the second attempt fails in the same way', async () => {
    const { user } = await open()
    await user.type(emailField(), marta.email)
    await user.type(passwordField(), 'not the password at all')
    await user.click(submit())
    await screen.findByRole('alert')

    await user.type(passwordField(), 'still not the password')
    await user.click(submit())

    expect(await screen.findByRole('alert')).toHaveTextContent('The email or the password is not right.')
  })

  it('says to wait when there have been too many attempts, and keeps what was typed', async () => {
    const { user } = await open(failWith(refusal(429, 'rate-limited')))
    await user.type(emailField(), marta.email)
    await user.type(passwordField(), demoPassword)

    await user.click(submit())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Wait a few minutes before trying again.',
    )
    expect(passwordField()).toHaveValue(demoPassword)
  })

  it('says the connection failed when the server could not be reached, and lets the person try again', async () => {
    const { user } = await open(failWith(new TransportError(null)))
    await user.type(emailField(), marta.email)
    await user.type(passwordField(), demoPassword)

    await user.click(submit())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't reach the server. Check your connection and try again.",
    )
    expect(submit()).not.toHaveAttribute('aria-busy', 'true')
  })
})

describe('the sign-in screen in Spanish', () => {
  it('has every text in the language of the person, the errors included', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    const { user } = renderSignedOut('/sign-in')
    await screen.findByRole('heading', { level: 1, name: 'Iniciar sesión' })

    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(screen.getByRole('textbox', { name: 'Correo electrónico' })).toHaveAccessibleDescription(
      'Escribe tu correo electrónico.',
    )
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription('Escribe tu contraseña.')
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Crea una cuenta' })).toBeInTheDocument()
    localStorage.clear()
  })
})
