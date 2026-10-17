import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { daniel, demoPassword, marta } from '../../data/mock/fixtures/index.ts'
import { rememberAccount, rememberedAccount } from './lastAccount.ts'
import { renderSignedOut } from './testing/renderSignedOut.tsx'

// Signing in as somebody else on a browser that held another account leaves that account (protocol §12.2): its copies are
// cleared, with the questions that has, and a failure to clear them is written down and does not stop the sign-in.

const leaving = vi.hoisted(() => ({ leaveAccount: vi.fn() }))
vi.mock('../../collab/leaveAccount.ts', () => ({ leaveAccount: leaving.leaveAccount, UNSTORED_WAIT_MS: 5_000 }))

beforeEach(() => {
  leaving.leaveAccount.mockReset()
  leaving.leaveAccount.mockResolvedValue({ purged: true })
  localStorage.clear()
})

async function signInAs(person: { email: string }, path = '/sign-in') {
  const view = renderSignedOut(path)
  await screen.findByRole('heading', { level: 1, name: path === '/sign-in' ? 'Sign in' : 'Create your account' })
  await view.user.type(screen.getByRole('textbox', { name: 'Email' }), person.email)
  await view.user.type(screen.getByLabelText('Password'), demoPassword)
  await view.user.click(screen.getByRole('button', { name: 'Sign in' }))
  return view
}

describe('signing in on a browser that held another account', () => {
  it('leaves that account first, with its own id, and remembers the new one', async () => {
    rememberAccount(marta.id)
    const { router } = await signInAs(daniel)

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(leaving.leaveAccount).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ userId: marta.id }))
    expect(rememberedAccount()).toBe(daniel.id)
  })

  it('does not leave anything when it is the same account that signs in again', async () => {
    rememberAccount(marta.id)
    const { router } = await signInAs(marta)

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(leaving.leaveAccount).not.toHaveBeenCalled()
  })

  it('does not leave anything when the browser held no account, and remembers the one that signs in', async () => {
    const { router } = await signInAs(marta)

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(leaving.leaveAccount).not.toHaveBeenCalled()
    expect(rememberedAccount()).toBe(marta.id)
  })

  it('drops what was read for the account that was there, which is not for this one', async () => {
    rememberAccount(marta.id)
    const view = renderSignedOut('/sign-in')
    await screen.findByRole('heading', { level: 1, name: 'Sign in' })
    view.queryClient.setQueryData(['workspaces', 'list'], { items: [{ name: 'Harbor & Pine' }] })
    await view.user.type(screen.getByRole('textbox', { name: 'Email' }), daniel.email)
    await view.user.type(screen.getByLabelText('Password'), demoPassword)

    await view.user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(view.router.state.location.pathname).toBe('/'))

    expect(view.queryClient.getQueryData(['workspaces', 'list'])).not.toEqual({ items: [{ name: 'Harbor & Pine' }] })
  })

  it('does not leave anything when the sign-in is refused: the account that was there is still the one', async () => {
    rememberAccount(marta.id)
    const view = renderSignedOut('/sign-in')
    await screen.findByRole('heading', { level: 1, name: 'Sign in' })
    await view.user.type(screen.getByRole('textbox', { name: 'Email' }), daniel.email)
    await view.user.type(screen.getByLabelText('Password'), 'not the password at all')

    await view.user.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByRole('alert')

    expect(leaving.leaveAccount).not.toHaveBeenCalled()
    expect(rememberedAccount()).toBe(marta.id)
  })

  it('asks what to do with changes that were never stored, and signs in whichever the answer', async () => {
    leaving.leaveAccount.mockImplementation(async ({ confirm }: { confirm: (count: number) => Promise<boolean> }) => {
      await confirm(1)
      return { purged: true }
    })
    rememberAccount(marta.id)
    const { router, user } = await signInAs(daniel)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('1 document has changes that were never stored')).toBeInTheDocument()
    expect(within(dialog).getByText(/under the account you were using/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Keep them' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('writes down that the copies could not be cleared and signs in all the same', async () => {
    const written = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    leaving.leaveAccount.mockRejectedValue(new Error('indexedDB.databases is not available'))
    rememberAccount(marta.id)

    const { router } = await signInAs(daniel)

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(written).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ message: expect.stringContaining('indexedDB') }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(rememberedAccount()).toBe(daniel.id)
    written.mockRestore()
  })
})

describe('signing up on a browser that held another account', () => {
  it('leaves that account too, because a new account is somebody else', async () => {
    rememberAccount(marta.id)
    const { user, router } = renderSignedOut('/sign-up')
    await screen.findByRole('heading', { level: 1, name: 'Create your account' })
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Lena Fischer')
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'lena@harborpine.example')
    await user.type(screen.getByLabelText('Password'), 'a phrase of several words')

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(leaving.leaveAccount).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ userId: marta.id }))
  })
})
