import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query'
import { configure, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { vi } from 'vitest'
import { AppProviders } from '../../../app/AppProviders.tsx'
import { routes } from '../../../app/routes.tsx'
import type { DataSource } from '../../../data/DataSource.ts'
import { DataSourceContext } from '../../../data/DataSourceContext.ts'
import { createMockServer } from '../../../data/mock/createMockDataSource.ts'
import * as fixtures from '../../../data/mock/fixtures/documents.ts'
import { marta } from '../../../data/mock/fixtures/index.ts'
import * as workspaceFixtures from '../../../data/mock/fixtures/workspaces.ts'

// The first test of a file waits for Vitest to load and transform the screens, which takes longer than the default second
// on a machine that is busy with something else.
configure({ asyncUtilTimeout: 5000 })

export { fixtures, workspaceFixtures }

export interface RenderScreenOptions {
  /** Who is signed in; Marta, who owns the workspace and so every document, unless said. */
  signedInAs?: string
  /** Replaces the data source, to make a call fail, slow or small, or to watch it. It starts from the mock. */
  wrap?: (dataSource: DataSource) => DataSource
}

/**
 * A screen of the app as the router mounts it: the real route table and layouts, the real providers and StrictMode, on
 * the mock data source with one person signed in. A path inside the editor layout that has no editor of its own
 * (`/documents/:id/share`) gives the explorer without loading Tiptap.
 *
 * The query client is the test's, so what a mutation marks stale can be read back from `invalidatedKeys`.
 */
export function renderScreen(path: string, { signedInAs = marta.email, wrap }: RenderScreenOptions = {}) {
  const server = createMockServer()
  const base = server.connect({ signedInAs })
  const dataSource = wrap?.(base) ?? base
  const queryClient = new QueryClient()
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  const router = createMemoryRouter(routes, { initialEntries: [path] })
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
  const invalidatedKeys = (): QueryKey[] =>
    invalidate.mock.calls.flatMap(([filters]) => (filters?.queryKey === undefined ? [] : [filters.queryKey]))
  return { ...view, router, server, queryClient, user: userEvent.setup(), invalidatedKeys }
}
