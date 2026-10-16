import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fixtures, renderScreen } from '../documents/testing/renderScreen.tsx'

// The explorer is in the layout of a document; the share route of one has no editor, so it opens without Tiptap.
const explorerPath = `/documents/${fixtures.launchPlan.id}/share`
const explorerSearch = () => screen.findByRole('searchbox', { name: 'Search documents' })
const documentsSearch = async () => within(await screen.findByRole('main')).findByRole('searchbox')

describe.each([
  ['the explorer', explorerPath, explorerSearch],
  ['Documents', '/documents', documentsSearch],
])('Enter in the search of %s', (_name, path, field) => {
  it('opens the results of what was typed, with the focus on their title', async () => {
    const { user, router } = renderScreen(path)

    await user.type(await field(), '  weekly {Enter}')

    const title = await screen.findByRole('heading', { level: 1, name: 'Results for “weekly”' })
    expect(router.state.location.pathname).toBe('/search')
    expect(router.state.location.search).toBe('?q=weekly')
    await waitFor(() => expect(title).toHaveFocus())
    expect(
      await within(screen.getByRole('main')).findByRole('link', { name: 'Weekly update — October 6' }),
    ).toBeVisible()
  })

  it('does nothing while the field is empty or holds only spaces', async () => {
    const { user, router } = renderScreen(path)

    await user.type(await field(), '{Enter}')
    await user.type(await field(), '   {Enter}')

    expect(router.state.location.pathname).toBe(path)
  })

  it('keeps the characters of the search that mean something in a URL', async () => {
    const { user } = renderScreen(path)

    await user.type(await field(), 'a&b#c%d{Enter}')

    expect(await screen.findByRole('heading', { level: 1, name: 'Results for “a&b#c%d”' })).toBeInTheDocument()
  })

  it('does not take the Enter that confirms a composition of an input method for a search', async () => {
    const { user, router } = renderScreen(path)
    const input = await field()
    await user.type(input, 'weekly')

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })

    expect(router.state.location.pathname).toBe(path)
  })

  it('sends only what Enter confirms: typing alone still filters in place', async () => {
    const { user, router } = renderScreen(path)

    await user.type(await field(), 'weekly')

    expect(router.state.location.pathname).toBe(path)
  })
})

describe('Enter in the search of a folder', () => {
  it('keeps filtering the folder: the search of a folder is not the search of the workspace', async () => {
    const { user, router } = renderScreen(`/folders/${fixtures.launchPlan.folderId ?? ''}`)

    await user.type(await documentsSearch(), 'weekly{Enter}')

    expect(router.state.location.pathname).toMatch(/^\/folders\//)
  })
})
