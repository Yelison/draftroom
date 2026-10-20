import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../../data/DataSource.ts'
import { daniel } from '../../../data/mock/fixtures/index.ts'
import { keysAfterMutation } from '../../../data/queryKeys.ts'
import { renderScreen, workspaceFixtures } from '../testing/renderScreen.tsx'

const { productFolder } = workspaceFixtures
const workspaceId = workspaceFixtures.harborPine.id
const main = () => screen.getByRole('main')

/** Watches what a call sends, without changing what it does. */
function spyOn<Name extends 'createFolder' | 'updateFolder'>(name: Name) {
  const requests: Parameters<DataSource[Name]>[0][] = []
  const wrap = (dataSource: DataSource): DataSource => ({
    ...dataSource,
    [name]: (request: Parameters<DataSource[Name]>[0]) => {
      requests.push(request)
      return (dataSource[name] as (request: unknown) => Promise<unknown>)(request)
    },
  })
  return { requests, wrap }
}

async function openNewFolder(options?: Parameters<typeof renderScreen>[1]) {
  const view = renderScreen('/documents', options)
  await view.user.click(await screen.findByRole('button', { name: 'More' }))
  await view.user.click(await screen.findByRole('menuitem', { name: 'New folder' }))
  return { ...view, dialog: await screen.findByRole('dialog', { name: 'New folder' }) }
}

async function openRenameFolder(options?: Parameters<typeof renderScreen>[1]) {
  const view = renderScreen('/documents', options)
  await view.user.click(await screen.findByRole('button', { name: 'Actions for Product' }))
  await view.user.click(await screen.findByRole('menuitem', { name: 'Rename folder' }))
  return { ...view, dialog: await screen.findByRole('dialog', { name: 'Rename folder' }) }
}

describe('creating a folder', () => {
  it('sends its name, and lists it', async () => {
    const { requests, wrap } = spyOn('createFolder')
    const { user, dialog } = await openNewFolder({ wrap })

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), '  Legal ')
    await user.click(within(dialog).getByRole('button', { name: 'Create folder' }))

    expect(await within(main()).findByRole('heading', { level: 2, name: 'Legal' })).toBeInTheDocument()
    expect(requests.map((request) => request?.body)).toEqual([{ name: 'Legal' }])
  })

  it('marks stale exactly what the table of the contract says', async () => {
    const { user, dialog, invalidatedKeys } = await openNewFolder()

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Legal')
    await user.click(within(dialog).getByRole('button', { name: 'Create folder' }))

    await waitFor(() => expect(invalidatedKeys()).toEqual(keysAfterMutation('createFolder', { workspaceId })))
  })

  it('asks for a name, and sends nothing without one', async () => {
    const { requests, wrap } = spyOn('createFolder')
    const { user, dialog } = await openNewFolder({ wrap })

    await user.click(within(dialog).getByRole('button', { name: 'Create folder' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Give the folder a name.')
    expect(requests).toEqual([])
  })

  it('puts the focus back on the button that opened the dialog', async () => {
    const { user, dialog } = await openNewFolder()

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Legal')
    await user.click(within(dialog).getByRole('button', { name: 'Create folder' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New folder' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus()
  })
})

describe('renaming a folder', () => {
  it('sends the new name with the revision the list has', async () => {
    const { requests, wrap } = spyOn('updateFolder')
    const { user, dialog } = await openRenameFolder({ wrap })

    const name = within(dialog).getByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'Roadmap')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(main()).findByRole('heading', { level: 2, name: 'Roadmap' })).toBeInTheDocument()
    expect(requests.map((request) => request?.body)).toEqual([{ name: 'Roadmap', revision: productFolder.revision }])
  })

  it('marks stale exactly what the table of the contract says', async () => {
    const { user, dialog, invalidatedKeys } = await openRenameFolder()

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' 2')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(invalidatedKeys()).toEqual(keysAfterMutation('updateFolder', { workspaceId })))
  })

  it('lets any member rename a folder, not only the owner of the workspace', async () => {
    const { user, dialog } = await openRenameFolder({ signedInAs: daniel.email })

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' 2')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(main()).findByRole('heading', { level: 2, name: 'Product 2' })).toBeInTheDocument()
  })

  it('says it was changed, keeps what was typed, and goes through on the next try', async () => {
    const { requests, wrap } = spyOn('updateFolder')
    const { user, dialog, server } = await openRenameFolder({ wrap })
    await server.connect({ signedInAs: daniel.email }).updateFolder({
      params: { path: { folderId: productFolder.id } },
      body: { name: 'Daniel’s folder', revision: productFolder.revision },
    })

    const name = within(dialog).getByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'Marta’s folder')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Someone else changed this just now')
    expect(name).toHaveValue('Marta’s folder')

    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(main()).findByRole('heading', { level: 2, name: 'Marta’s folder' })).toBeInTheDocument()
    expect(requests.map((request) => request?.body.revision)).toEqual([
      productFolder.revision,
      productFolder.revision + 1,
    ])
  })
})
