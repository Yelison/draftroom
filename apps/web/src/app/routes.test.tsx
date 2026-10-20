import { screen } from '@testing-library/react'
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
  { path: '/settings/profile', active: 'Settings', heading: 'Settings', rail: 'expanded' },
  { path: '/settings/workspace', active: 'Settings', heading: 'Settings', rail: 'expanded' },
  { path: '/settings/members', active: 'Settings', heading: 'Settings', rail: 'expanded' },
  { path: '/settings/appearance', active: 'Settings', heading: 'Settings', rail: 'expanded' },
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

  it('opens Profile from /settings', async () => {
    const { router } = renderApp('/settings')

    expect(await screen.findByRole('link', { current: 'page' })).toHaveTextContent('Settings')
    expect(router.state.location.pathname).toBe('/settings/profile')
  })

  it('titles the tab after the page, in the language of the app', () => {
    renderApp('/documents/d1/versions')

    expect(document.title).toBe('Version history · Draftroom')
  })

  it.each(['/documents/d1/share', '/search?q=budget', '/trash'])('leaves the Settings item alone on %s', (path) => {
    renderApp(path)

    expect(screen.getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current')
  })
})

describe('the explorer', () => {
  it('is beside a document in the editor', () => {
    renderApp('/documents/new')

    expect(screen.getByRole('complementary', { name: 'Explorer' })).toBeInTheDocument()
  })

  it('is left out of the history of a document, which keeps the compact rail and its place in Documents', () => {
    renderApp('/documents/d1/versions')

    expect(screen.queryByRole('complementary', { name: 'Explorer' })).not.toBeInTheDocument()
    expectRail('compact')
    expect(screen.getAllByRole('link', { current: 'page' }).map((link) => link.textContent)).toEqual(['Documents'])
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
      expect(screen.queryAllByRole('link', { current: 'page' }).map((link) => link.textContent)).toEqual(['Documents'])
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
    { path: '/settings/profile', english: 'Settings', spanish: 'Configuración' },
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
    expect(rail).toHaveTextContent('InicioDocumentosCompartidosHistorialConfiguración')
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
