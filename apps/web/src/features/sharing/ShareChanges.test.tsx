import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { daniel, sofia } from '../../data/mock/fixtures/index.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { queryKeys } from '../../data/queryKeys.ts'
import { workspaceFixtures } from '../documents/testing/renderScreen.tsx'
import {
  answer,
  interviews,
  launchPlan,
  openShare,
  pathOf,
  people,
  renderScreen,
  roleOf,
} from './testing/openShare.tsx'

const workspaceId = workspaceFixtures.harborPine.id

/** What the table of `docs/api/README.md` says a change of access makes stale, written out key by key. */
const keysAfterAccessChange = (documentId: string) => [
  queryKeys.access(documentId),
  queryKeys.document(documentId),
  queryKeys.shared(workspaceId),
  queryKeys.workspaceActivity(workspaceId),
  queryKeys.documentActivity(documentId),
]

const status = (share: HTMLElement) =>
  within(share)
    .getAllByRole('status')
    .map((region) => region.textContent)

describe('changing a role in the share dialog', () => {
  it('sends the new role, says so, and makes stale what the table names', async () => {
    const setAccess = vi.fn()
    const { user, share, invalidatedKeys } = await openShare({
      wrap: (dataSource) => ({
        ...dataSource,
        setAccess: (request) => {
          setAccess(request)
          return dataSource.setAccess(request)
        },
      }),
    })

    await user.selectOptions(roleOf(share, 'Sofía Lindqvist'), 'editor')

    await waitFor(() => expect(status(share)).toContain('The role of Sofía Lindqvist is now Editor.'))
    expect(setAccess).toHaveBeenCalledExactlyOnceWith({
      params: { path: { documentId: launchPlan.id, userId: sofia.id } },
      body: { role: 'editor' },
    })
    expect(invalidatedKeys()).toEqual(keysAfterAccessChange(launchPlan.id))
    expect(roleOf(share, 'Sofía Lindqvist')).toHaveValue('editor')
  })

  it('announces the same change again when it is made twice in a row', async () => {
    const { user, share } = await openShare()
    const announced = () => within(share).getByText(/^The role of Sofía Lindqvist is now/)

    await user.selectOptions(roleOf(share, 'Sofía Lindqvist'), 'editor')
    await waitFor(() => expect(announced()).toHaveTextContent('Editor'))
    const first = announced()
    await user.selectOptions(roleOf(share, 'Sofía Lindqvist'), 'commenter')
    await waitFor(() => expect(announced()).toHaveTextContent('Commenter'))
    await user.selectOptions(roleOf(share, 'Sofía Lindqvist'), 'editor')
    await waitFor(() => expect(announced()).toHaveTextContent('Editor'))

    // A new element in the region each time: a text that is replaced by an identical one is not read again.
    expect(announced()).not.toBe(first)
  })

  it('leaves the role alone and says why when the server refuses', async () => {
    const { user, share } = await openShare({
      wrap: (dataSource) => ({ ...dataSource, setAccess: () => Promise.reject(answer(503, 'unavailable')) }),
    })

    await user.selectOptions(roleOf(share, 'Sofía Lindqvist'), 'editor')

    expect(await within(share).findByRole('alert')).toHaveTextContent('Draftroom is unavailable right now')
    expect(roleOf(share, 'Sofía Lindqvist')).toHaveValue('commenter')
    expect(status(share).join('')).toBe('')
  })
})

describe('adding someone in the share dialog', () => {
  it('gives the chosen person the chosen role, announces it, makes stale what the table names and lists them', async () => {
    const setAccess = vi.fn()
    const { user, share, invalidatedKeys } = await openShare({
      documentId: interviews.id,
      wrap: (dataSource) => ({
        ...dataSource,
        setAccess: (request) => {
          setAccess(request)
          return dataSource.setAccess(request)
        },
      }),
    })

    await user.selectOptions(within(share).getByRole('combobox', { name: 'Person' }), 'Daniel Okafor')
    await user.selectOptions(within(share).getByRole('combobox', { name: 'Role' }), 'editor')
    await user.click(within(share).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(status(share)).toContain('Daniel Okafor was given the role Editor.'))
    expect(setAccess).toHaveBeenCalledExactlyOnceWith({
      params: { path: { documentId: interviews.id, userId: daniel.id } },
      body: { role: 'editor' },
    })
    expect(invalidatedKeys()).toEqual(keysAfterAccessChange(interviews.id))
    expect(await within(share).findByRole('combobox', { name: 'Role of Daniel Okafor' })).toHaveValue('editor')
  })

  it('takes the person out of the choices once they are in, and puts the focus back on the picker or the list', async () => {
    const { user, share } = await openShare({ documentId: interviews.id })

    await user.selectOptions(within(share).getByRole('combobox', { name: 'Person' }), 'Daniel Okafor')
    await user.click(within(share).getByRole('button', { name: 'Add' }))

    // Nobody is left to add, so the picker is gone: the focus is in the list, where the person was working.
    await within(share).findByText('Everyone in the workspace already has a role.')
    expect(share.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(document.body)
  })
})

describe('removing someone in the share dialog', () => {
  it('takes the role away, says so, makes stale what the table names and leaves the focus in the list', async () => {
    const removeAccess = vi.fn()
    const { user, share, invalidatedKeys } = await openShare({
      wrap: (dataSource) => ({
        ...dataSource,
        removeAccess: (request) => {
          removeAccess(request)
          return dataSource.removeAccess(request)
        },
      }),
    })

    await user.click(within(share).getByRole('button', { name: 'Remove Daniel Okafor' }))

    await waitFor(() => expect(status(share)).toContain('Daniel Okafor no longer has access.'))
    expect(removeAccess).toHaveBeenCalledExactlyOnceWith({
      params: { path: { documentId: launchPlan.id, userId: daniel.id } },
    })
    expect(invalidatedKeys()).toEqual(keysAfterAccessChange(launchPlan.id))
    await waitFor(() => expect(people(share)).toHaveLength(2))
    expect(within(share).queryByRole('combobox', { name: 'Role of Daniel Okafor' })).not.toBeInTheDocument()
    await waitFor(() => expect(roleOf(share, 'Marta Ruiz')).toHaveFocus())
  })
})

describe('the general access in the share dialog', () => {
  it('sets how the workspace can open the document, announces it and makes stale what the table names', async () => {
    const setGeneralAccess = vi.fn()
    const { user, share, invalidatedKeys } = await openShare({
      wrap: (dataSource) => ({
        ...dataSource,
        setGeneralAccess: (request) => {
          setGeneralAccess(request)
          return dataSource.setGeneralAccess(request)
        },
      }),
    })

    await user.selectOptions(within(share).getByRole('combobox', { name: 'Everyone in the workspace' }), 'viewer')

    await waitFor(() => expect(status(share)).toContain('General access: Can view.'))
    expect(setGeneralAccess).toHaveBeenCalledExactlyOnceWith({
      params: { path: { documentId: launchPlan.id } },
      body: { generalAccess: 'viewer' },
    })
    expect(invalidatedKeys()).toEqual(keysAfterAccessChange(launchPlan.id))
  })
})

describe('the last owner in the share dialog', () => {
  const lastOwnerNote = 'Last owner. Give the owner role to someone else before changing or removing this one.'

  it('cannot be lowered or removed: the controls say why and send nothing', async () => {
    const setAccess = vi.fn()
    const removeAccess = vi.fn()
    const { user, share } = await openShare({
      wrap: (dataSource) => ({ ...dataSource, setAccess, removeAccess }),
    })

    const role = roleOf(share, 'Marta Ruiz')
    const remove = within(share).getByRole('button', { name: 'Remove Marta Ruiz' })
    expect(role).toHaveAccessibleDescription(lastOwnerNote)
    expect(remove).toHaveAccessibleDescription(lastOwnerNote)
    await user.selectOptions(role, 'viewer')
    await user.click(remove)

    expect(setAccess).not.toHaveBeenCalled()
    expect(removeAccess).not.toHaveBeenCalled()
    expect(role).toHaveValue('owner')
  })

  it('is not marked on a person when there is another owner', async () => {
    const { share } = await openShare({
      wrap: (dataSource) => ({
        ...dataSource,
        listAccess: async (request) => {
          const list = await dataSource.listAccess(request)
          return { ...list, items: list.items.map((entry) => ({ ...entry, role: 'owner' as const })) }
        },
      }),
    })

    expect(within(share).queryByText(lastOwnerNote)).not.toBeInTheDocument()
    expect(within(share).getByRole('button', { name: 'Remove Daniel Okafor' })).not.toHaveAttribute('aria-disabled')
  })

  const refuse = (wrap: (dataSource: DataSource) => DataSource) => openShare({ wrap })

  it('shows the explanation of the server when it refuses to lower an owner that the screen thought was not the last', async () => {
    const { user, share } = await refuse((dataSource) => ({
      ...dataSource,
      listAccess: async (request) => {
        const list = await dataSource.listAccess(request)
        return {
          ...list,
          items: list.items.map((entry) => (entry.userId === daniel.id ? { ...entry, role: 'owner' as const } : entry)),
        }
      },
      setAccess: () => Promise.reject(answer(409, 'last-owner')),
    }))

    await user.selectOptions(roleOf(share, 'Daniel Okafor'), 'viewer')

    expect(await within(share).findByRole('alert')).toHaveTextContent(
      'A document needs at least one owner. Give the owner role to someone else first.',
    )
    expect(roleOf(share, 'Daniel Okafor')).toHaveValue('owner')
  })

  it('shows the same explanation when the server refuses to remove one, whichever status carries the code', async () => {
    const { user, share } = await refuse((dataSource) => ({
      ...dataSource,
      removeAccess: () => Promise.reject(answer(400, 'last-owner')),
    }))

    await user.click(within(share).getByRole('button', { name: 'Remove Sofía Lindqvist' }))

    expect(await within(share).findByRole('alert')).toHaveTextContent(
      'A document needs at least one owner. Give the owner role to someone else first.',
    )
    expect(within(share).getByRole('combobox', { name: 'Role of Sofía Lindqvist' })).toBeInTheDocument()
  })

  it('says it in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen(pathOf(launchPlan.id))

    const share = await screen.findByRole('dialog', { name: /^Compartir «/ })
    const role = await within(share).findByRole('combobox', { name: 'Rol de Marta Ruiz' })

    expect(role).toHaveAccessibleDescription(
      'Último propietario. Da el rol de propietario a otra persona antes de cambiar o quitar este.',
    )
  })
})
