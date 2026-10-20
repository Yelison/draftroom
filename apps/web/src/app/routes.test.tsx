import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { launchPlan } from '../data/mock/fixtures/documents.ts'
import { localeStorageKey } from '../i18n/locale.ts'
import { renderApp } from '../test/renderApp.tsx'

/** The compact rail is the base of the stylesheet, so it is the one with no class of its own; the expanded one has `expanded`. */
function expectRail(rail: 'expanded' | 'compact') {
  const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
  if (rail === 'expanded') expect(navigation).toHaveClass('expanded')
  else expect(navigation).not.toHaveClass('expanded')
}

/** The rail item that is current on each route, the headline of the page and the rail of the layout it opens in. */
const routeCases = [
  { path: '/', active: 'Home', heading: 'Home', rail: 'expanded' },
  { path: '/documents', active: 'Documents', heading: 'Documents', rail: 'expanded' },
  { path: '/folders/design-team', active: 'Documents', heading: 'Folder', rail: 'expanded' },
  { path: '/templates/meeting-notes', active: 'Documents', heading: 'Template', rail: 'expanded' },
  { path: '/shared', active: 'Shared', heading: 'Shared', rail: 'expanded' },
  { path: '/shared?access=editor&selected=d1', active: 'Shared', heading: 'Shared', rail: 'expanded' },
  { path: '/history', active: 'History', heading: 'History', rail: 'expanded' },
  { path: '/members', active: 'Members', heading: 'Members', rail: 'expanded' },
  // Settings is a dialog over the page, which stays the one the rail says it is.
  { path: '/documents?settings=profile', active: 'Documents', heading: 'Documents', rail: 'expanded' },
  { path: '/documents/new?settings=profile', active: 'Documents', heading: 'New document', rail: 'compact' },
  { path: '/trash', active: 'Documents', heading: 'Trash', rail: 'expanded' },
  { path: '/search?q=budget', active: 'Documents', heading: 'Search documents', rail: 'expanded' },
  { path: '/documents/new', active: 'Documents', heading: 'New document', rail: 'compact' },
  { path: '/documents/d1/versions', active: 'Documents', heading: 'Version history', rail: 'compact' },
  { path: '/no/such/page', active: undefined, heading: 'Page not found', rail: 'expanded' },
] as const

describe('the route table', () => {
  it.each(routeCases)('$path: one current item ($active), headline "$heading"', ({ path, active, heading, rail }) => {
    renderApp(path)

    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(heading)
    expectRail(rail)
    const current = screen.queryAllByRole('link', { current: 'page' }).map((link) => link.textContent)
    expect(current).toEqual(active === undefined ? [] : [active])
  })

  it('sends /settings/members to the Members page, which is no longer a part of Settings', async () => {
    const { router } = renderApp('/settings/members')

    expect(await screen.findByRole('heading', { level: 1, name: 'Members' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/members')
    expect(screen.getAllByRole('link', { current: 'page' }).map((link) => link.textContent)).toEqual(['Members'])
  })

  it('titles the tab after the page, in the language of the app', () => {
    renderApp('/documents/d1/versions')

    expect(document.title).toBe('Version history · Draftroom')
  })
})

describe('the explorer', () => {
  it('is beside a document in the editor', () => {
    renderApp('/documents/new')

    expect(screen.getByRole('complementary', { name: 'Explorer' })).toBeInTheDocument()
  })

  it('is out of the way in the history of a document: unreachable, which keeps the compact rail and its place in Documents', () => {
    renderApp('/documents/d1/versions')

    const explorer = screen.getByRole('complementary', { name: 'Explorer' })
    expect(explorer.closest('[inert]')).not.toBeNull()
    expectRail('compact')
    expect(screen.getAllByRole('link', { current: 'page' }).map((link) => link.textContent)).toEqual(['Documents'])
  })

  it('is the same one when the person comes back from the history, with the folders as they left them', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/documents/new')
    const explorer = screen.getByRole('complementary', { name: 'Explorer' })
    const folder = await screen.findByRole('button', { name: 'Operaciones' })
    expect(folder).toHaveAttribute('aria-expanded', 'false')
    await user.click(folder)
    expect(folder).toHaveAttribute('aria-expanded', 'true')

    await act(() => router.navigate('/documents/d1/versions'))
    expect(screen.getByRole('complementary', { name: 'Explorer' })).toBe(explorer)
    expect(explorer.closest('[inert]')).not.toBeNull()
    await act(() => router.navigate('/documents/new'))

    expect(screen.getByRole('complementary', { name: 'Explorer' })).toBe(explorer)
    expect(explorer.closest('[inert]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Operaciones' })).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('the share route', () => {
  afterEach(() => localStorage.clear())
  const shareOf = `/documents/${launchPlan.id}/share`
  // The route loads the editor, with Tiptap and the collaboration, in StrictMode: the first test of a file waits for Vitest
  // to load and transform it, and on a machine that is busy that took longer than the second of a wait and the five of a
  // test. The same margin as `features/sharing/testing/openShare.tsx`; a dialog that never arrives still fails.
  const arrival = { timeout: 10_000 }
  const testTimeout = 20_000

  it(
    'is a dialog over the editor: Documents stays current, the rail stays compact and the document stays behind',
    async () => {
      renderApp(shareOf)

      expect(await screen.findByRole('dialog', { name: 'Share “Autumn launch plan”' }, arrival)).toBeInTheDocument()
      expectRail('compact')
      expect(screen.queryAllByRole('link', { current: 'page' }).map((link) => link.textContent)).toEqual([
        'Documents',
        'Autumn launch plan',
      ])
      expect(screen.getByRole('heading', { level: 1, hidden: true })).toHaveTextContent('Autumn launch plan')
    },
    testTimeout,
  )

  it(
    'names the dialog in Spanish when the app is in Spanish',
    async () => {
      localStorage.setItem(localeStorageKey, 'es')
      renderApp(shareOf)

      expect(await screen.findByRole('dialog', { name: 'Compartir «Autumn launch plan»' }, arrival)).toBeInTheDocument()
    },
    testTimeout,
  )
})

describe('the texts of the shell in both languages', () => {
  afterEach(() => vi.restoreAllMocks())

  it('opens in the language of the browser when nothing was chosen', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-MX'])

    renderApp('/documents')

    expect(screen.getByRole('heading', { level: 1, name: 'Documentos' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('es')
  })

  const railLabels = [
    { path: '/', english: 'Home', spanish: 'Inicio' },
    { path: '/documents', english: 'Documents', spanish: 'Documentos' },
    { path: '/shared', english: 'Shared', spanish: 'Compartidos' },
    { path: '/history', english: 'History', spanish: 'Historial' },
    { path: '/members', english: 'Members', spanish: 'Miembros' },
  ]

  it.each(
    railLabels.flatMap(({ path, english, spanish }) => [
      { locale: 'en', path, label: english },
      { locale: 'es', path, label: spanish },
    ]),
  )('$locale: the rail item "$label" is the headline of $path', ({ locale, path, label }) => {
    localStorage.setItem(localeStorageKey, locale)

    renderApp(path)

    expect(screen.getByRole('link', { current: 'page' })).toHaveAccessibleName(label)
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(label)
  })

  it('names every item of the rail in Spanish, with the navigation and the skip link', () => {
    localStorage.setItem(localeStorageKey, 'es')

    renderApp('/')

    const rail = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(rail).toHaveTextContent('InicioDocumentosCompartidosHistorialMiembros')
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toBeInTheDocument()
    expect(document.title).toBe('Inicio · Draftroom')
  })

  it.each([
    { path: '/documents/d1/versions', title: 'Historial de versiones' },
    { path: '/documents/new', title: 'Nuevo documento' },
    { path: '/no/such/page', title: 'Página no encontrada' },
  ])('titles $path "$title" in Spanish, in the page and in the tab', ({ path, title }) => {
    localStorage.setItem(localeStorageKey, 'es')

    renderApp(path)

    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(document.title).toBe(`${title} · Draftroom`)
  })
})
