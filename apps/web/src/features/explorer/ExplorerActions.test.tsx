import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { daniel } from '../../data/mock/fixtures/index.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { fixtures, renderScreen } from '../documents/testing/renderScreen.tsx'

const { launchPlan, weeklyEnglish, budget } = fixtures
const pathOf = (id: string) => `/documents/${id}`
const explorer = () => screen.findByRole('complementary', { name: 'Explorer' })
const row = (name: string, index = 0) => screen.getAllByRole('treeitem', { name })[index] as HTMLElement

describe('archiving from the explorer', () => {
  it('archives the open document with Delete after asking, and takes the person to Documents saying so', async () => {
    const { user, router } = renderScreen(pathOf(launchPlan.id))
    await explorer()
    await screen.findByRole('tree')
    row('Autumn launch plan').focus()

    await user.keyboard('{Delete}')
    const confirmation = await screen.findByRole('dialog', { name: 'Archive “Autumn launch plan”?' })
    await user.click(within(confirmation).getByRole('button', { name: 'Archive' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/documents'))
    await waitFor(() =>
      expect(
        within(screen.getByRole('main'))
          .getAllByRole('status')
          .map((region) => region.textContent),
      ).toContain('“Autumn launch plan” was archived.'),
    )
  })

  it('leaves the focus on the headline of Documents, not on the body, once the open document is gone', async () => {
    const { user, router } = renderScreen(pathOf(launchPlan.id))
    await screen.findByRole('tree')
    row('Autumn launch plan').focus()

    await user.keyboard('{Delete}')
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Archive “Autumn launch plan”?' })).getByRole('button', {
        name: 'Archive',
      }),
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/documents'))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Documents' })).toHaveFocus())
  })

  it('does not archive when the person says no, and the focus goes back to the row', async () => {
    const { user, router } = renderScreen(pathOf(launchPlan.id))
    await screen.findByRole('tree')
    const opener = row('Autumn launch plan')
    opener.focus()

    await user.keyboard('{Delete}')
    const confirmation = await screen.findByRole('dialog', { name: 'Archive “Autumn launch plan”?' })
    await user.click(within(confirmation).getByRole('button', { name: 'Close' }))

    expect(router.state.location.pathname).toBe(pathOf(launchPlan.id))
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('archives a document that is not the open one without leaving, and the focus stays in the tree', async () => {
    const { user, router } = renderScreen(pathOf(launchPlan.id))
    await screen.findByRole('tree')
    row('Weekly update — October 6').focus()

    await user.keyboard('{Delete}')
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Archive “Weekly update — October 6”?' })).getByRole('button', {
        name: 'Archive',
      }),
    )

    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: 'Weekly update — October 6' })).not.toBeInTheDocument(),
    )
    expect(router.state.location.pathname).toBe(pathOf(launchPlan.id))
    await waitFor(() =>
      expect(screen.getAllByRole('treeitem').includes(document.activeElement as HTMLElement)).toBe(true),
    )
    await waitFor(() =>
      expect(within(screen.getByRole('complementary', { name: 'Explorer' })).getByRole('status')).toHaveTextContent(
        '“Weekly update — October 6” was archived.',
      ),
    )
  })

  it('does nothing on Delete for a document the person does not own', async () => {
    const { user } = renderScreen(pathOf(launchPlan.id), { signedInAs: daniel.email })
    await screen.findByRole('tree')
    // Daniel can edit the launch plan, so he can rename it; he does not own it, so he cannot archive it.
    row('Autumn launch plan').focus()

    await user.keyboard('{Delete}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('renaming and moving from the explorer', () => {
  it('opens the rename-or-move dialog of the focused document with F2', async () => {
    const { user } = renderScreen(pathOf(launchPlan.id))
    await screen.findByRole('tree')
    row('Autumn launch plan').focus()

    await user.keyboard('{F2}')

    const dialog = await screen.findByRole('dialog', { name: 'Rename or move' })
    expect(within(dialog).getByRole('textbox', { name: 'Title' })).toHaveValue('Autumn launch plan')
  })

  it('opens it with the menu key too', async () => {
    const { user } = renderScreen(pathOf(launchPlan.id))
    await screen.findByRole('tree')
    row('Autumn launch plan').focus()

    await user.keyboard('{ContextMenu}')

    expect(await screen.findByRole('dialog', { name: 'Rename or move' })).toBeInTheDocument()
  })

  it('renames a folder with F2', async () => {
    const { user } = renderScreen(pathOf(launchPlan.id))
    await screen.findByRole('tree')
    row('Operaciones').focus()

    await user.keyboard('{F2}')

    const dialog = await screen.findByRole('dialog', { name: 'Rename folder' })
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Operaciones')
  })

  it('does not offer a document the person can only read to be renamed', async () => {
    const { user } = renderScreen(pathOf(launchPlan.id), { signedInAs: daniel.email })
    await screen.findByRole('tree')
    row(budget.title).focus()

    await user.keyboard('{F2}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the new title in the tree after it is saved', async () => {
    const { user } = renderScreen(pathOf(launchPlan.id))
    await screen.findByRole('tree')
    row('Weekly update — October 6').focus()
    await user.keyboard('{F2}')
    const dialog = await screen.findByRole('dialog', { name: 'Rename or move' })

    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), ' (draft)')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findAllByRole('treeitem', { name: 'Weekly update — October 6 (draft)' })).not.toHaveLength(0)
  })
})

describe('creating from the explorer', () => {
  it('creates a document and opens it', async () => {
    const { user, router } = renderScreen(pathOf(launchPlan.id))
    await screen.findByRole('tree')

    await user.click(within(await explorer()).getByRole('button', { name: 'New document' }))

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/documents\/[0-9a-f-]{36}$/))
    expect(router.state.location.pathname).not.toContain(launchPlan.id)
  }, 20_000)

  it('selects the new document in the tree once it is open', async () => {
    const { user, router } = renderScreen(pathOf(launchPlan.id))
    await screen.findByRole('tree')

    await user.click(within(await explorer()).getByRole('button', { name: 'New document' }))

    await waitFor(() => expect(router.state.location.pathname).not.toBe(pathOf(launchPlan.id)))
    await waitFor(() => {
      const selected = screen.getAllByRole('treeitem').filter((item) => item.getAttribute('aria-selected') === 'true')
      expect(selected.map((item) => item.textContent)).toEqual(['Untitled document'])
    })
    // The new document opens in the editor, whose chunk (Tiptap, ProseMirror, Yjs) is slow to load in a test.
  }, 20_000)

  it('creates a folder and lists it', async () => {
    const { user } = renderScreen(pathOf(launchPlan.id))
    await screen.findByRole('tree')

    await user.click(within(await explorer()).getByRole('button', { name: 'New folder' }))
    const dialog = await screen.findByRole('dialog', { name: 'New folder' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Legal')
    await user.click(within(dialog).getByRole('button', { name: 'Create folder' }))

    expect(await screen.findByRole('treeitem', { name: 'Legal' })).toBeInTheDocument()
  })
})

describe('the explorer in Spanish', () => {
  it('is written in Spanish, with the names of the people’s documents as they are', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen(pathOf(weeklyEnglish.id))

    expect(await screen.findByRole('complementary', { name: 'Explorador' })).toBeInTheDocument()
    expect(await screen.findByRole('tree', { name: 'Documentos y carpetas' })).toBeInTheDocument()
    expect(row('Recientes')).toBeInTheDocument()
    expect(screen.getAllByRole('treeitem', { name: 'Weekly update — October 6' })).not.toHaveLength(0)
    expect(screen.getByRole('searchbox', { name: 'Buscar documentos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nueva carpeta' })).toBeInTheDocument()
  })
})
