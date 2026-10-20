import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, TransportError } from '../../data/errors.ts'
import { demoPassword, marta } from '../../data/mock/fixtures/index.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { renderSignedOut } from './testing/renderSignedOut.tsx'

const refusal = (status: number, code: ApiError['code']) =>
  new ApiError({ type: 'about:blank', title: 'Refused', status, code })

const nameField = () => screen.getByRole('textbox', { name: 'Name' })
const emailField = () => screen.getByRole('textbox', { name: 'Email' })
const passwordField = () => screen.getByLabelText('Password')
const submit = () => screen.getByRole('button', { name: 'Create account' })
const password = 'a phrase of several words'

async function open(options?: Parameters<typeof renderSignedOut>[1]) {
  const view = renderSignedOut('/sign-up', options)
  await screen.findByRole('heading', { level: 1, name: 'Create your account' })
  return view
}

async function fill(
  user: Awaited<ReturnType<typeof open>>['user'],
  values: { name?: string; email?: string; password?: string },
) {
  if (values.name !== undefined) await user.type(nameField(), values.name)
  if (values.email !== undefined) await user.type(emailField(), values.email)
  if (values.password !== undefined) await user.type(passwordField(), values.password)
}

describe('the sign-up screen', () => {
  it('has a headline, the three fields with their labels, the rule for the password and one button', async () => {
    await open()

    expect(nameField()).toHaveAttribute('autocomplete', 'name')
    expect(emailField()).toHaveAttribute('autocomplete', 'username')
    expect(passwordField()).toHaveAttribute('autocomplete', 'new-password')
    expect(passwordField()).toHaveAccessibleDescription(/At least 12 characters/)
    expect(submit()).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Create your account · Draftroom'))
  })

  it('goes to sign-in, keeping where the person was going', async () => {
    const { user, router } = renderSignedOut('/sign-up', { state: { from: '/shared' } })
    await screen.findByRole('heading', { level: 1, name: 'Create your account' })

    await user.click(screen.getByRole('link', { name: 'Sign in' }))

    expect(router.state.location.pathname).toBe('/sign-in')
    expect(router.state.location.state).toEqual({ from: '/shared' })
  })
})

describe('creating an account', () => {
  it('signs the person in, and takes them to where they were going', async () => {
    const { user, router } = renderSignedOut('/sign-up', { state: { from: '/shared' } })
    await screen.findByRole('heading', { level: 1, name: 'Create your account' })

    await fill(user, { name: 'Lena Fischer', email: 'lena@harborpine.example', password })
    await user.click(submit())

    await waitFor(() => expect(router.state.location.pathname).toBe('/shared'))
  })

  it('leaves the account in the server with the name that was typed, and the session that of the new person', async () => {
    const { user, server } = await open()

    await fill(user, { name: '  Lena Fischer  ', email: 'lena@harborpine.example', password })
    await user.click(submit())
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create your account' })).not.toBeInTheDocument())

    const signedIn = await server.connect().signIn({ body: { email: 'lena@harborpine.example', password } })
    expect(signedIn.name).toBe('Lena Fischer')
  })

  it('claims the address that a workspace invited, which keeps its person', async () => {
    const { user, server, router } = await open()
    const owner = server.connect({ signedInAs: marta.email })
    const [workspace] = (await owner.listWorkspaces()).items
    const invited = await owner.addMember({
      params: { path: { workspaceId: workspace?.id ?? '' } },
      body: { email: 'lena@harborpine.example', role: 'member' },
    })

    await fill(user, { name: 'Lena Fischer', email: 'LENA@harborpine.example', password })
    await user.click(submit())

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    const members = await owner.listMembers({ params: { path: { workspaceId: workspace?.id ?? '' } } })
    expect(members.items.find((member) => member.userId === invited.userId)).toMatchObject({ name: 'Lena Fischer' })
  })

  it('works from the keyboard alone', async () => {
    const { user, router } = await open()

    await user.type(nameField(), 'Lena Fischer')
    await user.tab()
    await user.keyboard('lena@harborpine.example')
    await user.tab()
    await user.keyboard(password)
    await user.keyboard('{Enter}')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('sends nothing twice for a second press while it waits', async () => {
    let answer: () => void = () => undefined
    let sent = 0
    const { user } = await open({
      wrap: (dataSource) => ({
        ...dataSource,
        signUp: (request) => {
          sent += 1
          return new Promise((resolve) => (answer = () => resolve(dataSource.signUp(request))))
        },
      }),
    })
    await fill(user, { name: 'Lena Fischer', email: 'lena@harborpine.example', password })

    await user.click(submit())
    // A submit that does not come through the button (`requestSubmit`, a password manager): the button's own refusal of a
    // click does not stop it, the form does.
    fireEvent.submit(passwordField().closest('form') as HTMLFormElement)
    // The query library starts a mutation a moment after it is asked to: let a second one show itself before counting.
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(sent).toBe(1)
    answer()
  })
})

describe('what is wrong before anything is sent', () => {
  it('names the three fields when they are empty, puts the focus on the first, and sends nothing', async () => {
    const signUp = vi.fn()
    const { user } = await open({ wrap: (dataSource) => ({ ...dataSource, signUp }) })

    await user.click(submit())

    expect(nameField()).toHaveFocus()
    expect(nameField()).toHaveAccessibleDescription('Enter your name.')
    expect(emailField()).toHaveAccessibleDescription('Enter your email.')
    expect(passwordField()).toHaveAccessibleDescription(/Enter your password\./)
    expect(signUp).not.toHaveBeenCalled()
  })

  it.each([
    [
      'a name over the limit',
      { name: 'a'.repeat(81), email: 'lena@harborpine.example', password },
      'A name can have up to 80 characters.',
    ],
    ['an address that is not one', { name: 'Lena', email: 'lena', password }, 'Enter an email like name@example.com.'],
    [
      'a password of eleven characters',
      { name: 'Lena', email: 'lena@harborpine.example', password: 'a'.repeat(11) },
      'Use at least 12 characters.',
    ],
    [
      'a password over the limit',
      { name: 'Lena', email: 'lena@harborpine.example', password: 'a'.repeat(129) },
      'A password can have up to 128 characters.',
    ],
  ])('says so for %s', async (_case, values, message) => {
    const { user } = await open()
    await user.click(nameField())
    await user.paste(values.name)
    await user.click(emailField())
    await user.paste(values.email)
    await user.click(passwordField())
    await user.paste(values.password)

    await user.click(submit())

    expect(screen.getByRole('main')).toHaveTextContent(message)
  })

  it('counts a password in characters as the server does: twelve emoji are twelve', async () => {
    const { user, router } = await open()

    await fill(user, { name: 'Lena', email: 'lena@harborpine.example' })
    await user.click(passwordField())
    await user.paste('🔑'.repeat(12))
    await user.click(submit())

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

describe('what the server refuses', () => {
  it('says the address already has an account, and where to sign in instead', async () => {
    const { user } = await open()

    await fill(user, { name: 'Marta Again', email: marta.email, password: demoPassword })
    await user.click(submit())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is already an account with this email. Sign in instead.',
    )
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it.each([
    ['too many attempts', refusal(429, 'rate-limited'), 'Too many attempts. Wait a few minutes before trying again.'],
    [
      'a connection that failed',
      new TransportError(null),
      "We couldn't reach the server. Check your connection and try again.",
    ],
    ['a failure of the server', refusal(500, 'internal-error'), 'Something went wrong. Try again.'],
  ])('says so for %s, and keeps what was typed', async (_case, error, message) => {
    const { user } = await open({ wrap: (dataSource) => ({ ...dataSource, signUp: () => Promise.reject(error) }) })
    await fill(user, { name: 'Lena Fischer', email: 'lena@harborpine.example', password })

    await user.click(submit())

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(nameField()).toHaveValue('Lena Fischer')
    expect(passwordField()).toHaveValue(password)
  })
})

describe('the sign-up screen in Spanish', () => {
  it('has every text in the language of the person, the errors and the rule included', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    const { user } = renderSignedOut('/sign-up')
    await screen.findByRole('heading', { level: 1, name: 'Crea tu cuenta' })

    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveAccessibleDescription('Escribe tu nombre.')
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription(/Al menos 12 caracteres/)
    expect(screen.getByText('Un espacio propio desde el primer día')).toBeInTheDocument()
    expect(screen.getByText(/Al crear tu cuenta empiezas en un espacio propio, con tu nombre/)).toBeInTheDocument()
    localStorage.clear()
  })
})
