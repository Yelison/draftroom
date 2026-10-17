import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, TransportError } from '../../data/errors.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { marta } from '../../data/mock/fixtures/index.ts'
import { renderScreen } from '../documents/testing/renderScreen.tsx'
import { rememberAccount, rememberedAccount } from './lastAccount.ts'

// Signing out from the app: what is done about the copies this browser keeps, in what order, and what the person is told
// when it cannot be done (protocol §12.2).

const leaving = vi.hoisted(() => ({ leaveAccount: vi.fn() }))
vi.mock('../../collab/leaveAccount.ts', () => ({ leaveAccount: leaving.leaveAccount, UNSTORED_WAIT_MS: 5_000 }))

const signOutButton = () => screen.getByRole('button', { name: 'Sign out' })
const order: string[] = []

beforeEach(() => {
  order.length = 0
  leaving.leaveAccount.mockReset()
  leaving.leaveAccount.mockImplementation(async () => {
    order.push('leaveAccount')
    return { purged: true }
  })
  localStorage.clear()
})

/** The app on Home, signed in as Marta, with a note of every call that ends the session. */
function open(options: { signOutFails?: boolean | 'ended' } = {}) {
  return renderScreen('/', {
    wrap: (dataSource) => ({
      ...dataSource,
      signOut: () => {
        order.push('signOut')
        if (options.signOutFails === 'ended') {
          return Promise.reject(
            new ApiError({ type: 'about:blank', title: 'Ended', status: 401, code: 'unauthenticated' }),
          )
        }
        return options.signOutFails === true ? Promise.reject(new TransportError(null)) : dataSource.signOut()
      },
    }),
  })
}

describe('signing out from the app', () => {
  it('is offered on every page of the app, which is where a person looks for it', async () => {
    const home = open()
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    home.unmount()

    renderScreen('/documents/new')
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('clears what this browser kept of the account first, for the account that is signed in, and then ends the session', async () => {
    const { user, router } = open()

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))
    expect(order).toEqual(['leaveAccount', 'signOut'])
    expect(leaving.leaveAccount).toHaveBeenCalledWith(expect.objectContaining({ userId: marta.id }))
  })

  it('leaves the person on the sign-in page, with the focus on its headline and not on a page that is gone', async () => {
    const { user, router } = open()

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))

    await waitFor(() => expect(document.activeElement?.tagName).toBe('H1'))
    expect(document.activeElement).toHaveTextContent('Sign in')
  })

  it('keeps nothing that was read for the account that was left', async () => {
    const { user, queryClient, router } = open()
    await screen.findByRole('button', { name: 'Sign out' })
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0)

    await user.click(signOutButton())
    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))

    // `SavedPreferences` stays on to ask who is signed in, and is told nobody is: what is left holds no data.
    await waitFor(() =>
      expect(
        queryClient
          .getQueryCache()
          .getAll()
          .filter((query) => query.state.data !== undefined),
      ).toEqual([]),
    )
  })

  it('forgets the account this browser held, so the next sign-in does not leave it a second time', async () => {
    rememberAccount(marta.id)
    const { user, router } = open()

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))

    expect(rememberedAccount()).toBeNull()
  })

  it('counts a session that had already ended as signed out, which is what the person asked for', async () => {
    const { user, router } = open({ signOutFails: 'ended' })

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))
  })

  it('is said in the language of the person', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    open()

    expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })
})

describe('signing out with changes that were never stored', () => {
  beforeEach(() => {
    leaving.leaveAccount.mockImplementation(async ({ confirm }: { confirm: (count: number) => Promise<boolean> }) => {
      order.push('leaveAccount')
      return (await confirm(2)) ? { purged: true } : { purged: false, unstoredDocuments: 2 }
    })
  })

  it('says how many documents are at stake and waits for the person before it ends the session', async () => {
    const { user } = open()

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('2 documents have changes that were never stored')).toBeInTheDocument()
    expect(order).toEqual(['leaveAccount'])
  })

  it('ends the session when the person agrees to lose them', async () => {
    const { user, router } = open()
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Leave and lose them' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))
    expect(order).toEqual(['leaveAccount', 'signOut'])
  })

  it('keeps the person signed in, with their copies, when they choose to stay', async () => {
    const { user, router } = open()
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Stay' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/')
    expect(order).toEqual(['leaveAccount'])
    // The focus goes back to what opened the dialog, so a keyboard does not lose its place.
    expect(document.activeElement).toBe(signOutButton())
  })
})

describe('signing out in a browser that cannot clear what it keeps', () => {
  beforeEach(() => {
    leaving.leaveAccount.mockRejectedValue(new Error('indexedDB.databases is not available'))
  })

  it('writes the failure down, and tells the person instead of leaving as if nothing were kept', async () => {
    const written = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { user } = open()

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText("This browser can't clear your saved copies")).toBeInTheDocument()
    expect(written).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ message: expect.stringContaining('indexedDB') }),
    )
    expect(order).toEqual([])
    written.mockRestore()
  })

  it('signs out without the purge when the person chooses to, and is not left half signed out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { user, router } = open()
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sign out anyway' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))
    expect(order).toEqual(['signOut'])
  })

  it('stays signed in when the person chooses to', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { user, router } = open()
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Stay signed in' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/')
    expect(order).toEqual([])
  })
})

describe('signing out when the server cannot be reached', () => {
  it('says so as an alert and keeps the person on the page, who can try again', async () => {
    const { user, router } = open({ signOutFails: true })

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't sign you out. Check your connection and try again.",
    )
    expect(router.state.location.pathname).toBe('/')
    expect(signOutButton()).not.toHaveAttribute('aria-busy', 'true')
  })
})
