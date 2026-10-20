import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { createMemoryRouter, Outlet, type RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataSourceContext } from '../data/DataSourceContext.ts'
import { createMockServer } from '../data/mock/createMockDataSource.ts'
import { marta } from '../data/mock/fixtures/index.ts'
import { renderApp } from '../test/renderApp.tsx'
import { simulateViewport } from '../test/viewport.ts'
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
    { to: '/documents/d1/versions', page: 'a page with an id', heading: 'Version history' },
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
      <DataSourceContext value={createMockServer().connect({ signedInAs: marta.email })}>
        <AppProviders>
          <RouterProvider router={router} />
        </AppProviders>
      </DataSourceContext>,
    )

    await act(() => router.navigate('/next'))

    expect(screen.getByRole('main')).toHaveFocus()
  })
})

describe('a dialog that is a route over its page', () => {
  const routes: RouteObject[] = [
    {
      Component: AppFrame,
      children: [
        {
          Component: OverviewLayout,
          children: [
            {
              path: 'page',
              element: (
                <>
                  <h1 tabIndex={-1}>Page</h1>
                  <button type="button">Open</button>
                  <Outlet />
                </>
              ),
              children: [{ path: 'dialog', handle: { dialog: true }, element: <p>Dialog</p> }],
            },
            { path: 'other', element: <h1 tabIndex={-1}>Other</h1> },
          ],
        },
      ],
    },
  ]
  const open = async (path: string) => {
    const router = createMemoryRouter(routes, { initialEntries: [path] })
    render(
      <DataSourceContext value={createMockServer().connect({ signedInAs: marta.email })}>
        <AppProviders>
          <RouterProvider router={router} />
        </AppProviders>
      </DataSourceContext>,
    )
    await screen.findByRole('button', { name: 'Open' })
    return router
  }

  it('leaves the focus where it is when it opens: the page is still there, and the dialog takes the focus itself', async () => {
    const router = await open('/page')
    screen.getByRole('button', { name: 'Open' }).focus()

    await act(() => router.navigate('/page/dialog'))

    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
  })

  it('leaves the focus where it is when it closes: what opened it takes it back, not the headline', async () => {
    const router = await open('/page/dialog')
    screen.getByRole('button', { name: 'Open' }).focus()

    await act(() => router.navigate('/page'))

    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
  })

  it('moves to the headline of the next page when the person leaves it for another page', async () => {
    const router = await open('/page/dialog')

    await act(() => router.navigate('/other'))

    expect(await screen.findByRole('heading', { level: 1, name: 'Other' })).toHaveFocus()
  })
})

describe('the order of the Tab key', () => {
  // The pages hold no control yet, so a probe in the work area shows where the content falls in the order.
  const rail = ['Skip to content', 'Home', 'Documents', 'Shared', 'History', 'Members', 'Settings']
  const layouts = [
    { layout: 'overview', Component: OverviewLayout, explorer: [] },
    // The explorer: its search, its two buttons, and the sections of the Documents screen, folded but for "Pinned".
    {
      layout: 'editor',
      Component: EditorLayout,
      explorer: ['Search documents', 'New document', 'More', 'Pinned'],
    },
  ]

  /** What a stop is called: its text, or its label when it has none (an icon button, a field). */
  const nameOf = (element: Element | null) =>
    element?.textContent ||
    element?.getAttribute('aria-label') ||
    (element instanceof HTMLInputElement ? element.labels?.[0]?.textContent : null) ||
    ''

  it.each(layouts)(
    'goes from the skip link through the rail, signing out and the explorer to the page, in the $layout layout',
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
      if (explorer.length > 0) await screen.findByRole('button', { name: 'Pinned' })
      // Signing out is the last stop of the rail, where it is seen: the focus passes it before the explorer and the page.
      await screen.findByRole('button', { name: 'Sign out' })

      // The explorer has a stop for each control of the sections that are open, so how many it takes depends on the documents:
      // what is fixed is where it starts and that nothing but it stands between the rail and the page.
      const expected = [...rail, 'Sign out', ...explorer]
      const visited: string[] = []
      const inExplorer: boolean[] = []
      for (let stop = 0; stop < 40 && visited.at(-1) !== 'Probe'; stop++) {
        await user.tab()
        visited.push(nameOf(document.activeElement))
        inExplorer.push(document.activeElement?.closest('aside[aria-label="Explorer"]') != null)
      }

      expect(visited.slice(0, expected.length)).toEqual(expected)
      expect(visited.at(-1)).toBe('Probe')
      expect(inExplorer.slice(rail.length + 1, -1).every(Boolean)).toBe(true)
    },
  )
})

describe('the tabs of a page', () => {
  const tabHandle = { tab: true }
  const routes: RouteObject[] = [
    {
      Component: AppFrame,
      children: [
        {
          Component: OverviewLayout,
          children: [
            {
              path: 'page',
              element: (
                <>
                  <h1 tabIndex={-1}>Page</h1>
                  <button type="button">Tab</button>
                  <Outlet />
                </>
              ),
              children: [
                { path: 'first', handle: tabHandle, element: <p>First</p> },
                { path: 'second', handle: tabHandle, element: <p>Second</p> },
              ],
            },
            { path: 'other', element: <h1 tabIndex={-1}>Other</h1> },
          ],
        },
      ],
    },
  ]
  const open = async (path: string) => {
    const router = createMemoryRouter(routes, { initialEntries: [path] })
    render(
      <DataSourceContext value={createMockServer().connect({ signedInAs: marta.email })}>
        <AppProviders>
          <RouterProvider router={router} />
        </AppProviders>
      </DataSourceContext>,
    )
    await screen.findByRole('heading', { level: 1 })
    return router
  }

  it('leaves the focus on the tab the person chose when they move to another tab', async () => {
    const router = await open('/page/first')
    screen.getByRole('button', { name: 'Tab' }).focus()

    await act(() => router.navigate('/page/second'))

    expect(screen.getByRole('button', { name: 'Tab' })).toHaveFocus()
  })

  it('moves to the headline of the next page when the person leaves the tabs for another page', async () => {
    const router = await open('/page/first')

    await act(() => router.navigate('/other'))

    expect(await screen.findByRole('heading', { level: 1, name: 'Other' })).toHaveFocus()
  })

  it('moves to the headline of the page when the person arrives at its tabs from another page', async () => {
    const router = await open('/other')

    await act(() => router.navigate('/page/first'))

    expect(await screen.findByRole('heading', { level: 1, name: 'Page' })).toHaveFocus()
  })
})

describe('the explorer when the window becomes narrower than a desktop', () => {
  afterEach(() => vi.restoreAllMocks())

  it('gives the focus to the page when the explorer, which is left out, has it taken away', async () => {
    const user = userEvent.setup()
    const viewport = simulateViewport(1440)
    renderApp('/documents/new')
    await user.click(await screen.findByRole('searchbox', { name: 'Search documents' }))
    expect(screen.getByRole('searchbox', { name: 'Search documents' })).toHaveFocus()

    // What the browser does to an element that its stylesheet has just hidden: the focus leaves it for no element.
    act(() => viewport.resizeTo(640))
    act(() => screen.getByRole('searchbox', { name: 'Search documents' }).blur())

    expect(screen.getByRole('heading', { level: 1, name: 'New document' })).toHaveFocus()
  })

  it('leaves the focus where it is when it was not in the explorer', async () => {
    const viewport = simulateViewport(1440)
    renderApp('/documents/new')
    const settings = await screen.findByRole('link', { name: 'Settings' })
    act(() => settings.focus())

    act(() => viewport.resizeTo(640))

    expect(settings).toHaveFocus()
  })

  it('does not move the focus when it leaves the explorer for another element of a desktop window', async () => {
    const user = userEvent.setup()
    simulateViewport(1440)
    renderApp('/documents/new')
    await user.click(await screen.findByRole('searchbox', { name: 'Search documents' }))

    await user.tab({ shift: true })

    expect(screen.getByRole('heading', { level: 1, name: 'New document' })).not.toHaveFocus()
  })
})
