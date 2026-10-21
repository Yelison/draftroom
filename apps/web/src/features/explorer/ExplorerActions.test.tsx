import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { daniel } from '../../data/mock/fixtures/index.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { fixtures, renderScreen } from '../documents/testing/renderScreen.tsx'

const { launchPlan, weeklyEnglish, budget } = fixtures
const pathOf = (id: string) => `/documents/${id}`
const explorer = () => screen.findByRole('complementary', { name: 'Explorer' })
const actionsOf = async (title: string) =>
  within(await explorer()).findByRole('button', { name: `Actions for ${title}` })
const toggle = async (name: string) => within(await explorer()).findByRole('button', { name })

describe('archiving from the explorer', () => {
  it('archives the open document from its menu after asking, and takes the person to Documents saying so', async () => {
    const { user, router } = renderScreen(pathOf(launchPlan.id))

    await user.click(await actionsOf('Autumn launch plan'))
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }))
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

    await user.click(await actionsOf('Autumn launch plan'))
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Archive “Autumn launch plan”?' })).getByRole('button', {
        name: 'Archive',
      }),
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/documents'))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Documents' })).toHaveFocus())
  })

  it('does not archive when the person says no, and the focus goes back to the button of the menu', async () => {
    const { user, router } = renderScreen(pathOf(launchPlan.id))
    const opener = await actionsOf('Autumn launch plan')

    await user.click(opener)
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }))
    const confirmation = await screen.findByRole('dialog', { name: 'Archive “Autumn launch plan”?' })
    await user.click(within(confirmation).getByRole('button', { name: 'Close' }))

    expect(router.state.location.pathname).toBe(pathOf(launchPlan.id))
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('archives a document that is not the open one without leaving, and says so in the explorer', async () => {
    const { user, router } = renderScreen(pathOf(launchPlan.id))
    await user.click(await toggle('No folder'))

    await user.click(await actionsOf('Weekly update — October 6'))
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Archive “Weekly update — October 6”?' })).getByRole('button', {
        name: 'Archive',
      }),
    )

    await waitFor(() =>
      expect(
        within(screen.getByRole('complementary', { name: 'Explorer' })).queryByRole('link', {
          name: 'Weekly update — October 6',
        }),
      ).not.toBeInTheDocument(),
    )
    expect(router.state.location.pathname).toBe(pathOf(launchPlan.id))
    await waitFor(() =>
      expect(within(screen.getByRole('complementary', { name: 'Explorer' })).getAllByRole('status')).toSatisfy(
        (regions: HTMLElement[]) =>
          regions.some((region) => region.textContent === '“Weekly update — October 6” was archived.'),
      ),
    )
  })

  it('does not offer archiving to someone who does not own the document, who can still rename it if they edit it', async () => {
    const { user } = renderScreen(pathOf(launchPlan.id), { signedInAs: daniel.email })

    await user.click(await actionsOf('Autumn launch plan'))

    expect(await screen.findByRole('menuitem', { name: 'Rename or move' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).not.toBeInTheDocument()
  })
})

describe('renaming and moving from the explorer', () => {
  it('opens the rename-or-move dialog of a document from its menu', async () => {
    const { user } = renderScreen(pathOf(launchPlan.id))

    await user.click(await actionsOf('Autumn launch plan'))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename or move' }))

    const dialog = await screen.findByRole('dialog', { name: 'Rename or move' })
    expect(within(dialog).getByRole('textbox', { name: 'Title' })).toHaveValue('Autumn launch plan')
  })

  it('renames a folder from its menu', async () => {
    const { user } = renderScreen(pathOf(launchPlan.id))

    await user.click(await actionsOf('Operaciones'))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename folder' }))

    const dialog = await screen.findByRole('dialog', { name: 'Rename folder' })
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Operaciones')
  })

  it('offers no menu for a document the person can only read', async () => {
    const { user } = renderScreen(pathOf(launchPlan.id), { signedInAs: daniel.email })
    await user.click(await toggle('Operaciones'))
    await within(await explorer()).findByRole('link', { name: budget.title })

    expect(
      within(await explorer()).queryByRole('button', { name: `Actions for ${budget.title}` }),
    ).not.toBeInTheDocument()
  })

  it('shows the new title in the explorer after it is saved', async () => {
    const { user } = renderScreen(pathOf(launchPlan.id))
    await user.click(await toggle('No folder'))
    await user.click(await actionsOf('Weekly update — October 6'))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename or move' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename or move' })

    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), ' (draft)')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(
      await within(await explorer()).findByRole('link', { name: 'Weekly update — October 6 (draft)' }),
    ).toBeInTheDocument()
  })
})

describe('creating from the explorer', () => {
  it('creates a document and opens it', async () => {
    const { user, router } = renderScreen(pathOf(launchPlan.id))

    await user.click(await within(await explorer()).findByRole('button', { name: 'New document' }))

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/documents\/[0-9a-f-]{36}$/))
    expect(router.state.location.pathname).not.toContain(launchPlan.id)
    // The new document opens in the editor, whose chunk (Tiptap, ProseMirror, Yjs) is slow to load in a test.
  }, 20_000)

  it('creates a folder from the menu of More and lists it', async () => {
    const { user } = renderScreen(pathOf(launchPlan.id))

    await user.click(await within(await explorer()).findByRole('button', { name: 'More' }))
    await user.click(await screen.findByRole('menuitem', { name: 'New folder' }))
    const dialog = await screen.findByRole('dialog', { name: 'New folder' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Legal')
    await user.click(within(dialog).getByRole('button', { name: 'Create folder' }))

    expect(await toggle('Legal')).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('the explorer in Spanish', () => {
  it('is written in Spanish, with the names of the people’s documents as they are', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen(pathOf(weeklyEnglish.id))

    expect(await screen.findByRole('complementary', { name: 'Explorador' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Fijados' })).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByRole('link', { name: 'Customer interview synthesis' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar documentos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Más' })).toBeInTheDocument()
  })
})
