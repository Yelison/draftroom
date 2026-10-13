import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { localeStorageKey } from '../i18n/locale.ts'
import { simulateViewport } from '../test/viewport.ts'
import { AppProviders } from './AppProviders.tsx'
import { DesktopGuard } from './DesktopGuard.tsx'
import { mainContentId } from './mainContent.ts'

function renderGuarded() {
  return render(
    <AppProviders>
      <DesktopGuard>
        <main id={mainContentId} tabIndex={-1}>
          <h1 tabIndex={-1}>Work area</h1>
          <label>
            Draft <input />
          </label>
        </main>
      </DesktopGuard>
    </AppProviders>,
  )
}

describe('the desktop requirement', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    { width: 1279, notice: true },
    { width: 1279.5, notice: true },
    { width: 1280, notice: false },
    { width: 1440, notice: false },
  ])('at $width px the notice is shown: $notice', ({ width, notice }) => {
    simulateViewport(width)

    renderGuarded()

    expect(screen.queryByRole('heading', { name: 'Draftroom needs a larger window' }) !== null).toBe(notice)
    expect(screen.queryByRole('heading', { name: 'Work area' }) === null).toBe(notice)
  })

  it.each([
    {
      locale: 'en',
      title: 'Draftroom needs a larger window',
      text: 'Open Draftroom in a desktop window at least 1,280 px wide.',
    },
    {
      locale: 'es',
      title: 'Draftroom necesita una ventana más grande',
      text: 'Abre Draftroom en una ventana de escritorio de al menos 1280 px de ancho.',
    },
  ])('explains it in $locale, with the width', ({ locale, title, text }) => {
    localStorage.setItem(localeStorageKey, locale)
    simulateViewport(1279)

    renderGuarded()

    expect(screen.getByRole('heading', { level: 1, name: title })).toHaveFocus()
    expect(screen.getByText(new RegExp(text))).toBeInTheDocument()
  })

  it('keeps the app and its state while the window is narrow, and gives the focus back to it', async () => {
    const user = userEvent.setup()
    const viewport = simulateViewport(1440)
    renderGuarded()
    await user.type(screen.getByRole('textbox', { name: 'Draft' }), 'Quarterly plan')

    act(() => viewport.resizeTo(1000))
    expect(screen.queryByRole('textbox', { name: 'Draft' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Draftroom needs a larger window' })).toHaveFocus()

    act(() => viewport.resizeTo(1280))
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Quarterly plan')
    expect(screen.getByRole('heading', { name: 'Work area' })).toHaveFocus()
    expect(screen.queryByRole('heading', { name: 'Draftroom needs a larger window' })).not.toBeInTheDocument()
  })

  it('asks the browser to tell it about the crossing, not about every pixel', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')
    simulateViewport(1440)

    renderGuarded()

    expect(addEventListener.mock.calls.map(([type]) => type)).not.toContain('resize')
  })
})
