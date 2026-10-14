import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AppProviders } from '../app/AppProviders.tsx'
import { routes } from '../app/routes.tsx'
import { DataSourceContext } from '../data/DataSourceContext.ts'
import { createMockServer } from '../data/mock/createMockDataSource.ts'
import { marta } from '../data/mock/fixtures/index.ts'

/**
 * The app as `main.tsx` mounts it (StrictMode included, which runs every effect twice), on an in-memory router, so a
 * test goes through the real providers and routes, on the mock data source with Marta signed in: the screens read their
 * lists through it. It returns the router, to read where the app is or to navigate it.
 */
export function renderApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(
    <StrictMode>
      <DataSourceContext value={createMockServer().connect({ signedInAs: marta.email })}>
        <AppProviders>
          <RouterProvider router={router} />
        </AppProviders>
      </DataSourceContext>
    </StrictMode>,
  )
  return { ...view, router }
}
