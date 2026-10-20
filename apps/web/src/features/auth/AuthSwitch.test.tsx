import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderSignedOut } from './testing/renderSignedOut.tsx'

const pair = () => screen.getByRole('navigation', { name: 'Sign in or create an account' })

describe('the switch between signing in and creating an account', () => {
  it.each([
    ['/sign-in', 'Sign in', 'Create account'],
    ['/sign-up', 'Create account', 'Sign in'],
  ])('marks %s as the page that is open, and the other one as a way out', async (path, open, other) => {
    renderSignedOut(path)
    await screen.findByRole('navigation', { name: 'Sign in or create an account' })

    expect(within(pair()).getByRole('link', { name: open })).toHaveAttribute('aria-current', 'page')
    expect(within(pair()).getByRole('link', { name: other })).not.toHaveAttribute('aria-current')
  })

  it('goes to the other screen and back by its own address, keeping where the person was going', async () => {
    const { user, router } = renderSignedOut('/sign-in', { state: { from: '/shared' } })
    await screen.findByRole('heading', { level: 1, name: 'Sign in' })

    await user.click(within(pair()).getByRole('link', { name: 'Create account' }))
    expect(router.state.location.pathname).toBe('/sign-up')
    expect(router.state.location.state).toEqual({ from: '/shared' })
    await screen.findByRole('heading', { level: 1, name: 'Create your account' })

    await user.click(within(pair()).getByRole('link', { name: 'Sign in' }))
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(router.state.location.state).toEqual({ from: '/shared' })
  })

  it('is reached with the keyboard before the headline, and Enter follows the link', async () => {
    const { user, router } = renderSignedOut('/sign-in')
    await screen.findByRole('heading', { level: 1, name: 'Sign in' })

    // The skip link, then the two ways of the switch, then the first field.
    await user.tab()
    await user.tab()
    await user.tab()
    expect(within(pair()).getByRole('link', { name: 'Create account' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(router.state.location.pathname).toBe('/sign-up')
  })
})
