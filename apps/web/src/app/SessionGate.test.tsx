import { focusManager } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../data/DataSource.ts'
import { DataSourceContext } from '../data/DataSourceContext.ts'
import { createMockServer } from '../data/mock/createMockDataSource.ts'
import { ApiError, TransportError } from '../data/errors.ts'
import { demoPassword, marta } from '../data/mock/fixtures/index.ts'
import { renderScreen } from '../features/documents/testing/renderScreen.tsx'
import { AppProviders } from './AppProviders.tsx'
import { routes } from './routes.tsx'
import { renderSignedOut } from '../features/auth/testing/renderSignedOut.tsx'

const refusal = (status: number, code: ApiError['code']) =>
  new ApiError({ type: 'about:blank', title: 'Refused', status, code })

describe('the gate, for a person with no session', () => {
  it('sends them to sign in from any page of the app', async () => {
    const { router } = renderSignedOut('/documents')

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/sign-in')
  })

  it('keeps the page they were going to, with its search and its hash, for afterwards', async () => {
    const { router } = renderSignedOut('/search?q=budget#top')

    await screen.findByRole('heading', { level: 1, name: 'Sign in' })

    expect(router.state.location.state).toEqual({ from: '/search?q=budget#top' })
  })

  it('replaces the page they were on in the history, so Back does not bring them to a door that sends them away', async () => {
    const { router } = renderSignedOut('/documents')
    await screen.findByRole('heading', { level: 1, name: 'Sign in' })

    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('takes them back to that page once they have signed in', async () => {
    const { router, user } = renderSignedOut('/search?q=budget')
    await screen.findByRole('heading', { level: 1, name: 'Sign in' })

    await user.type(screen.getByLabelText('Email'), marta.email)
    await user.type(screen.getByLabelText('Password'), demoPassword)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/search'))
    expect(router.state.location.search).toBe('?q=budget')
  })

  it('does not stand in the way of the sign-in and sign-up pages themselves', async () => {
    renderSignedOut('/sign-up')

    expect(await screen.findByRole('heading', { level: 1, name: 'Create your account' })).toBeInTheDocument()
  })
})

describe('the gate, for a person with a session', () => {
  it('opens the page', async () => {
    renderScreen('/documents')

    expect(await screen.findByRole('heading', { level: 1, name: 'Documents' })).toBeInTheDocument()
  })

  it('does not send them anywhere because the server could not be reached: the page says its own failures', async () => {
    let asked = 0
    const { router } = renderScreen('/documents', {
      wrap: (dataSource) => ({
        ...dataSource,
        getMe: () => {
          asked += 1
          return Promise.reject(new TransportError(null))
        },
      }),
    })
    await screen.findByRole('heading', { level: 1, name: 'Documents' })

    // The question is asked again once, and only then is it known that it could not be answered.
    await waitFor(() => expect(asked).toBeGreaterThanOrEqual(2), { timeout: 4000 })
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(router.state.location.pathname).toBe('/documents')
  })

  it('sends them to sign in when the session ends while the app is open, from the page they were on', async () => {
    let ended = false
    // The app's own providers and query client, which is where a refused request is noticed.
    const dataSource = new Proxy(createMockServer().connect({ signedInAs: marta.email }), {
      get: (target, name: keyof DataSource) =>
        ended && typeof target[name] === 'function'
          ? () => Promise.reject(refusal(401, 'unauthenticated'))
          : target[name],
    })
    const router = createMemoryRouter(routes, { initialEntries: ['/documents'] })
    render(
      <DataSourceContext value={dataSource}>
        <AppProviders>
          <RouterProvider router={router} />
        </AppProviders>
      </DataSourceContext>,
    )
    await screen.findByRole('heading', { level: 1, name: 'Documents' })

    // What a person does to come back to the tab: the page asks again for what it shows.
    ended = true
    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))
    expect(router.state.location.state).toEqual({ from: '/documents' })
  })
})
