import { within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { daniel, harborPine } from '../../data/mock/fixtures/index.ts'
import { main, openTab, refusal, renderScreen } from './testing/openSettings.tsx'

const nameField = () => within(main()).getByRole('textbox', { name: 'Workspace name' })
const save = () => within(main()).getByRole('button', { name: 'Save changes' })

describe('the Workspace tab', () => {
  it('lets an owner rename the workspace, and says so once the server has stored it', async () => {
    const { user, server } = await openTab('workspace', 'Workspace')
    expect(nameField()).toHaveValue('Harbor Pine')

    await user.clear(nameField())
    await user.type(nameField(), 'Harbor Pine Studio')
    await user.click(save())

    expect(await within(main()).findByText('Changes saved')).toBeInTheDocument()
    const stored = await server.connect({ signedInAs: 'marta@harborpine.example' }).getWorkspace({
      params: { path: { workspaceId: harborPine.id } },
    })
    expect(stored.name).toBe('Harbor Pine Studio')
  })

  it('shows the name to a member without a way to change it', async () => {
    await openTab('workspace', 'Workspace', { signedInAs: daniel.email })

    expect(nameField()).toHaveAttribute('readonly')
    expect(within(main()).getByText('Only owners can rename the workspace.')).toBeInTheDocument()
    expect(within(main()).queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })

  it('asks for a name when it is left empty, and sends nothing', async () => {
    let calls = 0
    const { user } = await openTab('workspace', 'Workspace', {
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

    expect(await within(main()).findByText('Enter a name for the workspace.')).toBeInTheDocument()
    expect(calls).toBe(0)
  })

  it('refuses a name over 80 code points before it is sent', async () => {
    const { user } = await openTab('workspace', 'Workspace')

    await user.clear(nameField())
    await user.paste('😀'.repeat(81))
    await user.click(save())

    expect(await within(main()).findByText('A name can have up to 80 characters.')).toBeInTheDocument()
  })

  it('says what went wrong when the server refuses, and keeps what was typed', async () => {
    const { user } = await openTab('workspace', 'Workspace', {
      wrap: (dataSource) => ({ ...dataSource, updateWorkspace: () => Promise.reject(refusal(403, 'forbidden')) }),
    })

    await user.type(nameField(), ' Studio')
    await user.click(save())

    expect(await within(main()).findByRole('alert')).toHaveTextContent("You don't have permission to do that.")
    expect(nameField()).toHaveValue('Harbor Pine Studio')
  })

  it('shows a skeleton with a spoken status while the workspace is on its way', async () => {
    renderScreen('/settings/workspace', {
      wrap: (dataSource) => ({ ...dataSource, getWorkspace: () => new Promise(() => undefined) }),
    })

    expect(await within(main()).findByText('Loading your settings')).toHaveAttribute('role', 'status')
  })

  it('says it could not read the workspace, and tries again when asked', async () => {
    let failures = 1
    const { user } = renderScreen('/settings/workspace', {
      wrap: (dataSource) => ({
        ...dataSource,
        getWorkspace: (request) =>
          failures-- > 0 ? Promise.reject(refusal(503, 'unavailable')) : dataSource.getWorkspace(request),
      }),
    })

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load your settings")
    await user.click(within(main()).getByRole('button', { name: 'Try again' }))

    expect(await within(main()).findByRole('textbox', { name: 'Workspace name' })).toHaveValue('Harbor Pine')
  })
})
