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

const notice = () => screen.queryByText('Draftroom is made for wider windows')

describe('the notice of a window narrower than the desktop requirement', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it.each([
    { width: 1279, shown: true },
    { width: 1279.5, shown: true },
    { width: 1280, shown: false },
    { width: 1440, shown: false },
  ])('at $width px it is shown: $shown, and the app is there either way', ({ width, shown }) => {
    simulateViewport(width)

    renderGuarded()

    expect(notice() !== null).toBe(shown)
    expect(screen.getByRole('heading', { name: 'Work area' })).toBeVisible()
  })

  it.each([
    {
      locale: 'en',
      title: 'Draftroom is made for wider windows',
      text: 'It works best in a window at least 1,280 px wide.',
      dismiss: 'Dismiss',
    },
    {
      locale: 'es',
      title: 'Draftroom está pensado para ventanas más anchas',
      text: 'Funciona mejor en una ventana de al menos 1280 px de ancho.',
      dismiss: 'Descartar',
    },
  ])('explains it in $locale, with the width', ({ locale, title, text, dismiss }) => {
    localStorage.setItem(localeStorageKey, locale)
    simulateViewport(1279)

    renderGuarded()

    expect(screen.getByText(title)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(text))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: dismiss })).toBeInTheDocument()
  })

  it('leaves the app, what is typed in it and the focus where they were while the window narrows', async () => {
    const user = userEvent.setup()
    const viewport = simulateViewport(1440)
    renderGuarded()
    await user.type(screen.getByRole('textbox', { name: 'Draft' }), 'Quarterly plan')

    act(() => viewport.resizeTo(640))

    expect(notice()).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Quarterly plan')
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveFocus()
  })

  it('goes away when the window is wide again, and comes back when it narrows', () => {
    const viewport = simulateViewport(1000)
    renderGuarded()
    expect(notice()).toBeInTheDocument()

    act(() => viewport.resizeTo(1280))
    expect(notice()).not.toBeInTheDocument()

    act(() => viewport.resizeTo(900))
    expect(notice()).toBeInTheDocument()
  })

  it('can be closed, takes the focus to the headline of the page when it is, and stays closed for the tab', async () => {
    const user = userEvent.setup()
    const viewport = simulateViewport(640)
    const first = renderGuarded()

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(notice()).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Work area' })).toHaveFocus()
    act(() => viewport.resizeTo(1440))
    act(() => viewport.resizeTo(640))
    expect(notice()).not.toBeInTheDocument()
    first.unmount()

    renderGuarded()

    expect(notice()).not.toBeInTheDocument()
  })

  it('asks the browser to tell it about the crossing, not about every pixel', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')
    simulateViewport(1440)

    renderGuarded()

    expect(addEventListener.mock.calls.map(([type]) => type)).not.toContain('resize')
  })
})
