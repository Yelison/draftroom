import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { createMemoryRouter, type RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { DataSourceContext } from '../data/DataSourceContext.ts'
import { createMockServer } from '../data/mock/createMockDataSource.ts'
import { marta } from '../data/mock/fixtures/index.ts'
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
    { to: '/documents/d1/share', page: 'a page with an id', heading: 'Share' },
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
  const rail = ['Skip to content', 'Home', 'Documents', 'Shared', 'History', 'Settings']
  const layouts = [
    { layout: 'overview', Component: OverviewLayout, explorer: [] },
    // The explorer is one stop for its search, one for each of its two buttons and one for the tree, however long it is.
    {
      layout: 'editor',
      Component: EditorLayout,
      explorer: ['Search documents', 'New document', 'New folder', 'Recent'],
    },
  ]

  /** What a stop is called: its text, or its label when it has none (an icon button, a field). */
  const nameOf = (element: Element | null) =>
    element?.textContent ||
    element?.getAttribute('aria-label') ||
    (element instanceof HTMLInputElement ? element.labels?.[0]?.textContent : null) ||
    ''

  it.each(layouts)(
    'goes from the skip link through the rail and the explorer to the page in the $layout layout',
    async ({ Component, explorer }) => {
      const user = userEvent.setup()
      const routes: RouteObject[] = [
        {
          Component: AppFrame,
          children: [{ Component, children: [{ index: true, element: <button>Probe</button> }] }],
        },
      ]
      render(
        <StrictMode>
          <DataSourceContext value={createMockServer().connect({ signedInAs: marta.email })}>
            <AppProviders>
              <RouterProvider router={createMemoryRouter(routes)} />
            </AppProviders>
          </DataSourceContext>
        </StrictMode>,
      )
      if (explorer.length > 0) await screen.findByRole('tree')

      const expected = [...rail, ...explorer, 'Probe']
      const visited: string[] = []
      for (let stop = 0; stop < expected.length; stop++) {
        await user.tab()
        visited.push(nameOf(document.activeElement))
      }

      expect(visited).toEqual(expected)
    },
  )
})
