import { act, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { marta } from '../../data/mock/fixtures/index.ts'
import { themeStorageKey } from '../../theme.ts'
import { main, openTab, refusal, renderScreen } from './testing/openSettings.tsx'

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset['theme']
  delete document.documentElement.dataset['editorTextSize']
})

describe('the Appearance tab, theme', () => {
  it('starts on the theme of the system', async () => {
    await openTab('appearance', 'Appearance')

    expect(within(main()).getByRole('radio', { name: 'System' })).toBeChecked()
  })

  it('applies the dark theme at once and says so', async () => {
    const { user } = await openTab('appearance', 'Appearance')

    await user.click(within(main()).getByRole('radio', { name: 'Dark' }))

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(within(main()).getByText('Dark theme on')).toHaveAttribute('role', 'status')
  })

  it('persists the theme: the next load opens on the one that was chosen', async () => {
    const first = await openTab('appearance', 'Appearance')
    await first.user.click(within(main()).getByRole('radio', { name: 'Dark' }))
    expect(localStorage.getItem(themeStorageKey)).toBe('dark')
    first.unmount()

    await openTab('appearance', 'Appearance')

    expect(within(main()).getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(within(main()).getByRole('radio', { name: 'System' })).not.toBeChecked()
  })
})

describe('the Appearance tab, editor text size', () => {
  it('starts on medium', async () => {
    await openTab('appearance', 'Appearance')

    expect(within(main()).getByRole('radio', { name: 'Medium' })).toBeChecked()
  })

  it('saves the size on the account, says so, and sets it on the page', async () => {
    const { user, server } = await openTab('appearance', 'Appearance')

    await user.click(within(main()).getByRole('radio', { name: 'Large' }))

    expect(await within(main()).findByText('Text size saved')).toHaveAttribute('role', 'status')
    expect(document.documentElement).toHaveAttribute('data-editor-text-size', 'large')
    expect((await server.connect({ signedInAs: marta.email }).getMe()).editorTextSize).toBe('large')
  })

  it('goes back to the base size when medium is chosen again', async () => {
    const { user } = await openTab('appearance', 'Appearance')
    await user.click(within(main()).getByRole('radio', { name: 'Small' }))
    await within(main()).findByText('Text size saved')
    expect(document.documentElement).toHaveAttribute('data-editor-text-size', 'small')

    await user.click(within(main()).getByRole('radio', { name: 'Medium' }))

    await act(async () => undefined)
    expect(await screen.findByText('Text size saved')).toBeInTheDocument()
    expect(document.documentElement).not.toHaveAttribute('data-editor-text-size')
  })

  it('does not set a size the server did not store, and says what went wrong', async () => {
    const { user } = await openTab('appearance', 'Appearance', {
      wrap: (dataSource) => ({ ...dataSource, updateMe: () => Promise.reject(refusal(503, 'unavailable')) }),
    })

    await user.click(within(main()).getByRole('radio', { name: 'Large' }))

    expect(await within(main()).findByRole('alert')).toHaveTextContent('Draftroom is unavailable right now.')
    expect(within(main()).getByRole('radio', { name: 'Medium' })).toBeChecked()
    expect(document.documentElement).not.toHaveAttribute('data-editor-text-size')
  })

  it('shows a skeleton with a spoken status while the account is on its way', async () => {
    renderScreen('/settings/appearance', {
      wrap: (dataSource) => ({ ...dataSource, getMe: () => new Promise(() => undefined) }),
    })

    expect(await within(main()).findByText('Loading your settings')).toHaveAttribute('role', 'status')
  })

  it('says it could not read the account, and tries again when asked', async () => {
    let failures = 1
    const { user } = renderScreen('/settings/appearance', {
      wrap: (dataSource) => ({
        ...dataSource,
        getMe: () => (failures-- > 0 ? Promise.reject(refusal(503, 'unavailable')) : dataSource.getMe()),
      }),
    })

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load your settings")
    await user.click(within(main()).getByRole('button', { name: 'Try again' }))

    expect(await within(main()).findByRole('radio', { name: 'Medium' })).toBeChecked()
  })
})
