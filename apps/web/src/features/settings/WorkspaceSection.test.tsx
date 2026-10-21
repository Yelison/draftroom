import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { daniel, harborPine } from '../../data/mock/fixtures/index.ts'
import { dialog, openSettings, refusal, renderScreen } from './testing/openSettings.tsx'

const nameField = () => within(dialog()).getByRole('textbox', { name: 'Workspace name' })
const save = () => within(dialog()).getByRole('button', { name: 'Save changes' })

describe('the Workspace section', () => {
  it('lets an owner rename the workspace, and says so once the server has stored it', async () => {
    const { user, server } = await openSettings()
    expect(nameField()).toHaveValue('Harbor Pine')

    await user.clear(nameField())
    await user.type(nameField(), 'Harbor Pine Studio')
    await user.click(save())

    expect(await within(dialog()).findByText('Changes saved')).toBeInTheDocument()
    const stored = await server.connect({ signedInAs: 'marta@harborpine.example' }).getWorkspace({
      params: { path: { workspaceId: harborPine.id } },
    })
    expect(stored.name).toBe('Harbor Pine Studio')
  })

  it('shows the name to a member without a way to change it, and sends nothing', async () => {
    let calls = 0
    const { user } = await openSettings({
      signedInAs: daniel.email,
      wrap: (dataSource) => ({
        ...dataSource,
        updateWorkspace: (request) => {
          calls++
          return dataSource.updateWorkspace(request)
        },
      }),
    })

    await user.type(nameField(), ' Studio')
    await user.click(save())

    expect(nameField()).toHaveAttribute('readonly')
    expect(nameField()).toHaveValue('Harbor Pine')
    expect(within(dialog()).getByText('Only owners can rename the workspace.')).toBeInTheDocument()
    expect(save()).toHaveAttribute('aria-disabled', 'true')
    expect(calls).toBe(0)
  })

  it('asks for a name when it is left empty, and sends nothing', async () => {
    let calls = 0
    const { user } = await openSettings({
      wrap: (dataSource) => ({
        ...dataSource,
        updateWorkspace: (request) => {
          calls++
          return dataSource.updateWorkspace(request)
        },
      }),
    })

    await user.clear(nameField())
    await user.click(save())

    expect(await within(dialog()).findByText('Enter a name for the workspace.')).toBeInTheDocument()
    expect(calls).toBe(0)
  })

  it('refuses a name over 80 code points before it is sent', async () => {
    const { user } = await openSettings()

    await user.clear(nameField())
    await user.paste('😀'.repeat(81))
    await user.click(save())

    expect(await within(dialog()).findByText('A name can have up to 80 characters.')).toBeInTheDocument()
  })

  it('says what went wrong when the server refuses, and keeps what was typed', async () => {
    const { user } = await openSettings({
      wrap: (dataSource) => ({ ...dataSource, updateWorkspace: () => Promise.reject(refusal(403, 'forbidden')) }),
    })

    await user.type(nameField(), ' Studio')
    await user.click(save())

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent("You don't have permission to do that.")
    expect(nameField()).toHaveValue('Harbor Pine Studio')
  })

  it('shows its section with a spoken status, inert, and no reason to read yet, while the workspace is on its way', async () => {
    renderScreen('/?settings=workspace', {
      wrap: (dataSource) => ({ ...dataSource, getWorkspace: () => new Promise(() => undefined) }),
    })

    expect(await within(dialog()).findByText('Loading your settings')).toHaveAttribute('role', 'status')
    expect(within(dialog()).getByRole('textbox', { name: 'Workspace name' })).toHaveValue('')
    expect(within(dialog()).queryByText('Only owners can rename the workspace.')).not.toBeInTheDocument()
    expect(dialog().querySelector('form')).toHaveAttribute('inert')
  })

  it('says it could not read the workspace, and tries again when asked', async () => {
    // Every screen that shows the workspace asks for it, so the failure holds until the person asks again.
    let broken = true
    const { user } = renderScreen('/?settings=workspace', {
      wrap: (dataSource) => ({
        ...dataSource,
        getWorkspace: (request) =>
          broken ? Promise.reject(refusal(503, 'unavailable')) : dataSource.getWorkspace(request),
      }),
    })
    expect(await within(await screen.findByRole('dialog', { name: 'Settings' })).findByRole('alert')).toHaveTextContent(
      "We couldn't load your settings",
    )

    broken = false
    await user.click(within(dialog()).getByRole('button', { name: 'Try again' }))

    expect(await within(dialog()).findByRole('textbox', { name: 'Workspace name' })).toHaveValue('Harbor Pine')
  })
})
