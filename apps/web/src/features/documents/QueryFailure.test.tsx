import { act, render, screen, waitFor } from '@testing-library/react'
import { focusManager } from '@tanstack/react-query'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { AppProviders } from '../../app/AppProviders.tsx'
import { routes } from '../../app/routes.tsx'
import type { DataSource } from '../../data/DataSource.ts'
import { DataSourceContext } from '../../data/DataSourceContext.ts'
import { ApiError, TransportError } from '../../data/errors.ts'
import { createMockServer } from '../../data/mock/createMockDataSource.ts'
import { marta } from '../../data/mock/fixtures/index.ts'

const failure = "We couldn't load these documents."
const unauthenticated = new ApiError({ type: 'about:blank', title: 'No session', status: 401, code: 'unauthenticated' })

/** The app with the providers it has (the query client that notices a refused session is theirs), signed in as Marta. */
function openDocuments(wrap: (dataSource: DataSource) => DataSource) {
  const router = createMemoryRouter(routes, { initialEntries: ['/documents'] })
  render(
    <DataSourceContext value={wrap(createMockServer().connect({ signedInAs: marta.email }))}>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </DataSourceContext>,
  )
  return router
}

/** Every text the page has been given, so that a message that is there for an instant is seen all the same. */
function recordTexts() {
  const seen = new Set<string>()
  const observer = new MutationObserver(() => seen.add(document.body.textContent ?? ''))
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  return {
    everShown: (text: string) => [...seen].some((snapshot) => snapshot.includes(text)),
    stop: () => observer.disconnect(),
  }
}

describe('what a list says when it could not be read', () => {
  it('says so, and offers to try again, when the server could not be reached', async () => {
    openDocuments((dataSource) => ({ ...dataSource, listFolders: () => Promise.reject(new TransportError(null)) }))

    // The first failure is retried once, a second later, before the page gives up.
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(failure)
    expect(screen.getByRole('button', { name: 'Try again to load Folders' })).toBeInTheDocument()
  })

  it('says nothing when the session is what has ended, because the gate is about to send the person to sign in', async () => {
    let ended = false
    const router = openDocuments(
      (dataSource) =>
        new Proxy(dataSource, {
          get: (target, name: keyof DataSource) =>
            ended && typeof target[name] === 'function' ? () => Promise.reject(unauthenticated) : target[name],
        }),
    )
    await screen.findByRole('heading', { level: 1, name: 'Documents' })
    const texts = recordTexts()

    ended = true
    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))
    expect(texts.everShown(failure), 'the failure was on screen, or in the live region, for a moment').toBe(false)
    texts.stop()
  })
})
