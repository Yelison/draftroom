import { act, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { marta } from '../../data/mock/fixtures/index.ts'
import { themeStorageKey } from '../../theme.ts'
import { dialog, openSettings, refusal, renderScreen } from './testing/openSettings.tsx'

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset['theme']
  delete document.documentElement.dataset['editorTextSize']
})

describe('the Appearance section, theme', () => {
  it('starts on the theme of the system', async () => {
    await openSettings()

    expect(within(dialog()).getByRole('radio', { name: 'System' })).toBeChecked()
  })

  it('applies the dark theme at once and says so', async () => {
    const { user } = await openSettings()

    await user.click(within(dialog()).getByRole('radio', { name: 'Dark' }))

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(within(dialog()).getByText('Dark theme on')).toHaveAttribute('role', 'status')
  })

  it('persists the theme: the next load opens on the one that was chosen', async () => {
    const first = await openSettings()
    await first.user.click(within(dialog()).getByRole('radio', { name: 'Dark' }))
    expect(localStorage.getItem(themeStorageKey)).toBe('dark')
    first.unmount()

    await openSettings()

    expect(within(dialog()).getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(within(dialog()).getByRole('radio', { name: 'System' })).not.toBeChecked()
  })
})

describe('the Appearance section, editor text size', () => {
  it('starts on medium', async () => {
    await openSettings()

    expect(within(dialog()).getByRole('radio', { name: 'Medium' })).toBeChecked()
  })

  it('saves the size on the account, says so, and sets it on the page', async () => {
    const { user, server } = await openSettings()

    await user.click(within(dialog()).getByRole('radio', { name: 'Large' }))

    expect(await within(dialog()).findByText('Text size saved')).toHaveAttribute('role', 'status')
    expect(document.documentElement).toHaveAttribute('data-editor-text-size', 'large')
    expect((await server.connect({ signedInAs: marta.email }).getMe()).editorTextSize).toBe('large')
  })

  it('goes back to the base size when medium is chosen again', async () => {
    const { user } = await openSettings()
    await user.click(within(dialog()).getByRole('radio', { name: 'Small' }))
    await within(dialog()).findByText('Text size saved')
    expect(document.documentElement).toHaveAttribute('data-editor-text-size', 'small')

    await user.click(within(dialog()).getByRole('radio', { name: 'Medium' }))

    await act(async () => undefined)
    expect(await screen.findByText('Text size saved')).toBeInTheDocument()
    expect(document.documentElement).not.toHaveAttribute('data-editor-text-size')
  })

  it('does not set a size the server did not store, and says what went wrong', async () => {
    const { user } = await openSettings({
      wrap: (dataSource) => ({ ...dataSource, updateMe: () => Promise.reject(refusal(503, 'unavailable')) }),
    })

    await user.click(within(dialog()).getByRole('radio', { name: 'Large' }))

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Draftroom is unavailable right now.')
    expect(within(dialog()).getByRole('radio', { name: 'Medium' })).toBeChecked()
    expect(document.documentElement).not.toHaveAttribute('data-editor-text-size')
  })

  it('shows a skeleton with a spoken status while the account is on its way', async () => {
    renderScreen('/?settings=appearance', {
      wrap: (dataSource) => ({ ...dataSource, getMe: () => new Promise(() => undefined) }),
    })

    expect(await within(dialog()).findByText('Loading your settings')).toHaveAttribute('role', 'status')
  })

  it('says it could not read the account, and tries again when asked', async () => {
    let failures = 1
    const { user } = renderScreen('/?settings=appearance', {
      wrap: (dataSource) => ({
        ...dataSource,
        getMe: () => (failures-- > 0 ? Promise.reject(refusal(503, 'unavailable')) : dataSource.getMe()),
      }),
    })

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent("We couldn't load your settings")
    await user.click(within(dialog()).getByRole('button', { name: 'Try again' }))

    expect(await within(dialog()).findByRole('radio', { name: 'Medium' })).toBeChecked()
  })
})
