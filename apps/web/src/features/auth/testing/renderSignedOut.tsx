import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configure, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AppProviders } from '../../../app/AppProviders.tsx'
import { routes } from '../../../app/routes.tsx'
import type { DataSource } from '../../../data/DataSource.ts'
import { DataSourceContext } from '../../../data/DataSourceContext.ts'
import { createMockServer, type MockServer } from '../../../data/mock/createMockDataSource.ts'

// The first test of a file waits for Vitest to load and transform the screens.
configure({ asyncUtilTimeout: 5000 })

export interface RenderSignedOutOptions {
  /** Replaces the data source, to make a call fail, slow or watch it. It starts from the mock with nobody signed in. */
  wrap?: (dataSource: DataSource, server: MockServer) => DataSource
  /** The router state the page was opened with, as the gate leaves it. */
  state?: unknown
}

/**
 * The app as a person with no session finds it: the real route table and providers on the mock data source with nobody
 * signed in. The mock starts signed in as somebody everywhere else (the demo and the end-to-end suite rely on it), so this
 * is the explicit way to have no session, and nothing changes the default.
 */
export function renderSignedOut(path: string, { wrap, state }: RenderSignedOutOptions = {}) {
  const server = createMockServer()
  const base = server.connect()
  const dataSource = wrap?.(base, server) ?? base
  const queryClient = new QueryClient()
  const router = createMemoryRouter(routes, { initialEntries: [{ pathname: path, state }] })
  const view = render(
    <StrictMode>
      <DataSourceContext value={dataSource}>
        <AppProviders>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </AppProviders>
      </DataSourceContext>
    </StrictMode>,
  )
  return { ...view, router, server, queryClient, user: userEvent.setup() }
}
