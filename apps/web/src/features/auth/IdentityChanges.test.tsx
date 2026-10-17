import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { copiesOf } from '../../collab/offlineCache.ts'
import type { DataSource } from '../../data/DataSource.ts'
import { ApiError } from '../../data/errors.ts'
import { marta } from '../../data/mock/fixtures/index.ts'
import { launchPlan, openEditor } from '../editor/testing/renderEditor.tsx'
import { renderScreen } from '../documents/testing/renderScreen.tsx'
import { lastAccountKey } from './lastAccount.ts'

// A browser has one session and many tabs. When another tab signs in as somebody else, or ends the session, this one is still
// showing the account it had: it has to find out, and ask who it is before it asks for anything else.

const lucia = { id: '00000000-0000-4000-8000-0000000000lu', email: 'lucia@harborpine.example', name: 'Lucía Fernández' }

/**
 * A data source for a browser whose session can be taken over by another tab: until `switchTo` it is Marta, and from then on
 * every call is made as Lucía. It writes down who each call was made as, and can hold the answer to `getMe`.
 */
function switchableSession() {
  const calls: string[] = []
  let identity: 'marta' | 'lucia' = 'marta'
  let heldMe: (() => void) | null = null
  let holdMe = false
  return {
    calls,
    switchTo(holdTheQuestion = false) {
      identity = 'lucia'
      holdMe = holdTheQuestion
    },
    releaseMe: () => heldMe?.(),
    wrap: (dataSource: DataSource): DataSource =>
      new Proxy(dataSource, {
        get(target, name: keyof DataSource) {
          const member = target[name]
          if (typeof member !== 'function') return member
          return async (...args: unknown[]) => {
            calls.push(`${String(name)} as ${identity}`)
            if (identity === 'lucia' && name === 'getMe') {
              if (holdMe) await new Promise<void>((resolve) => (heldMe = resolve))
              return { ...lucia, locale: null, editorTextSize: 'medium' }
            }
            if (identity === 'lucia' && name === 'getDocument') {
              throw new ApiError({ type: 'about:blank', title: 'Not found', status: 404, code: 'not-found' })
            }
            return (member as (...inner: unknown[]) => unknown).apply(target, args)
          }
        },
      }),
  }
}

const storageEventOfAnotherTab = () =>
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: lastAccountKey, oldValue: marta.id, newValue: lucia.id }))
  })

describe('when another tab of the browser signs in as somebody else', () => {
  it('empties what this tab read, and asks who is signed in before it asks for anything else', async () => {
    const session = switchableSession()
    const { queryClient } = renderScreen('/documents', { wrap: session.wrap })
    await screen.findByRole('heading', { level: 1, name: 'Documents' })
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    session.calls.length = 0

    session.switchTo(true)
    storageEventOfAnotherTab()

    // The page waits: nothing of Marta's is on screen, nothing was kept, and the only question asked is who this is.
    await waitFor(() => expect(session.calls).toEqual(['getMe as lucia']))
    expect(screen.queryByRole('heading', { level: 1, name: 'Documents' })).not.toBeInTheDocument()
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .filter((query) => query.state.data !== undefined),
    ).toEqual([])

    await act(async () => session.releaseMe())

    await screen.findByRole('heading', { level: 1, name: 'Documents' })
    expect(session.calls.filter((call) => call.endsWith('as marta'))).toEqual([])
    expect(session.calls.slice(1).length).toBeGreaterThan(0)
  })

  it('sends the person to sign in when the other tab ended the session instead', async () => {
    let ended = false
    const { router } = renderScreen('/documents', {
      wrap: (dataSource) => ({
        ...dataSource,
        getMe: () =>
          ended
            ? Promise.reject(
                new ApiError({ type: 'about:blank', title: 'No session', status: 401, code: 'unauthenticated' }),
              )
            : dataSource.getMe(),
      }),
    })
    await screen.findByRole('heading', { level: 1, name: 'Documents' })

    // The other tab signed out: it forgets the account this browser held, and the session is gone from the server.
    ended = true
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: lastAccountKey, oldValue: marta.id, newValue: null }))
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))
    expect(router.state.location.state).toEqual({ from: '/documents' })
  })

  it('ignores what other tabs write for their own reasons', async () => {
    const session = switchableSession()
    const { queryClient } = renderScreen('/documents', { wrap: session.wrap })
    await screen.findByRole('heading', { level: 1, name: 'Documents' })
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    session.calls.length = 0

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'draftroom-locale', oldValue: 'en', newValue: 'es' }))
    })

    expect(screen.getByRole('heading', { level: 1, name: 'Documents' })).toBeInTheDocument()
    expect(session.calls).toEqual([])
  })
})

describe('when the connection of the open document is closed because the session ended', () => {
  it('does not purge the copy of the account that was signed in when the next answer is a not found of the new one', async () => {
    const session = switchableSession()
    const { server } = await openEditor({ wrap: session.wrap })
    await waitFor(() => expect(screen.getByText('Sync status: Synced')).toBeInTheDocument())
    expect(await copiesOf(marta.id)).toHaveLength(1)

    // Another tab signed in as Lucía, who has no access to the document: the server ends this tab's socket, and the next
    // thing the page asks of the API is answered as Lucía, with a not found.
    session.switchTo()
    act(() => server.collaboration.closeConnections(4401, 'unauthenticated'))

    // The page is asked who it is first, and only then asks for the document again; the copy of the account that was left stays.
    await waitFor(() => expect(session.calls).toContain('getMe as lucia'))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Document content' })).not.toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: 'Your access to this document was removed' })).not.toBeInTheDocument()
    expect(await copiesOf(marta.id)).toHaveLength(1)
    expect(launchPlan.id).toBeDefined()
  })
})
