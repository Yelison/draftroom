import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { createMemoryRouter, type RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/renderApp.tsx'
import { AppFrame } from './AppFrame.tsx'
import { EditorLayout } from './layouts/EditorLayout.tsx'
import { OverviewLayout } from './layouts/OverviewLayout.tsx'
import { AppProviders } from './AppProviders.tsx'

describe('the focus when the person navigates', () => {
  it('stays where the keyboard starts on the first load: the skip link is the first stop', async () => {
    renderApp('/documents')

    expect(document.body).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus()
  })

  it('does not take the focus on the first load of a redirected address either', async () => {
    renderApp('/settings')

    await screen.findByRole('heading', { level: 1, name: 'Settings' })
    expect(document.body).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus()
  })

  it('moves to the headline of the new page when a rail item is activated with the keyboard', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await user.tab()
    await user.tab()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Documents' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('heading', { level: 1, name: 'Documents' })).toHaveFocus()
  })

  it.each([
    { to: '/documents/d1', page: 'a page with an id', heading: 'Document' },
    { to: '/documents/new', page: 'a page of the other layout', heading: 'New document' },
    { to: '/settings', page: 'an address that redirects', heading: 'Settings' },
    { to: '/no/such/page', page: 'a page that does not exist', heading: 'Page not found' },
  ])('moves to the headline of $page, and never to the body', async ({ to, heading }) => {
    const { router } = renderApp('/history')

    await act(() => router.navigate(to))

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toHaveFocus()
  })

  it('stays where it is when only the search of the same page changes', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/shared')
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Shared' })).toHaveFocus()

    await act(() => router.navigate('/shared?access=editor'))

    expect(screen.getByRole('link', { name: 'Shared' })).toHaveFocus()
  })

  it('moves the skip link to the headline too, without changing the address', async () => {
    const user = userEvent.setup()
    renderApp('/documents')

    await user.tab()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('heading', { level: 1, name: 'Documents' })).toHaveFocus()
    // The browser's address, not the router's: a followed fragment would show here even if the router ignored it.
    expect(window.location.hash).toBe('')
  })
})

describe('a page whose headline cannot take the focus', () => {
  it('leaves it on the work area, not on the body', async () => {
    const routes: RouteObject[] = [
      {
        Component: AppFrame,
        children: [
          {
            Component: OverviewLayout,
            children: [
              { index: true, element: <h1>Start</h1> },
              { path: 'next', element: <h1>Next</h1> },
            ],
          },
        ],
      },
    ]
    const router = createMemoryRouter(routes)
    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    )

    await act(() => router.navigate('/next'))

    expect(screen.getByRole('main')).toHaveFocus()
  })
})

describe('the order of the Tab key', () => {
  // The pages hold no control yet, so a probe in the work area shows where the content falls in the order.
  const layouts = [
    { layout: 'overview', Component: OverviewLayout },
    { layout: 'editor', Component: EditorLayout },
  ]

  it.each(layouts)(
    'goes from the skip link through the rail to the page in the $layout layout',
    async ({ Component }) => {
      const user = userEvent.setup()
      const routes: RouteObject[] = [
        {
          Component: AppFrame,
          children: [{ Component, children: [{ index: true, element: <button>Probe</button> }] }],
        },
      ]
      render(
        <StrictMode>
          <AppProviders>
            <RouterProvider router={createMemoryRouter(routes)} />
          </AppProviders>
        </StrictMode>,
      )

      const visited: string[] = []
      for (let stop = 0; stop < 7; stop++) {
        await user.tab()
        visited.push(document.activeElement?.textContent ?? '')
      }

      expect(visited).toEqual(['Skip to content', 'Home', 'Documents', 'Shared', 'History', 'Settings', 'Probe'])
    },
  )
})
