import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AppProviders } from '../app/AppProviders.tsx'
import { routes } from '../app/router.tsx'

/** The app as `main.tsx` mounts it, on an in-memory router, so a test goes through the real providers and routes. */
export function renderApp(path = '/') {
  return render(
    <AppProviders>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </AppProviders>,
  )
}
