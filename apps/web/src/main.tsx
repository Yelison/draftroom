// Forma UI's CSS goes first, in the order its documentation asks for (tokens, components, base), and the app's own
// after it: a `className` has the same specificity as the component's rule, so the later stylesheet wins. This module
// imports before any component, which is what puts the rules of the package ahead of the CSS of the components.
import './styles/forma-tokens.css'
import '@yelison/forma-ui/styles.css'
import '@yelison/forma-ui/base.css'
import './styles/global.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AppProviders } from './app/AppProviders.tsx'
import { routes } from './app/router.tsx'

const container = document.getElementById('root')
if (container === null) throw new Error('index.html has no #root element')

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={createBrowserRouter(routes)} />
    </AppProviders>
  </StrictMode>,
)
