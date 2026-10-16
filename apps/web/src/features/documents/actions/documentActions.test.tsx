import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../data/errors.ts'
import type { DataSource } from '../../../data/DataSource.ts'
import { daniel } from '../../../data/mock/fixtures/index.ts'
import { keysAfterMutation } from '../../../data/queryKeys.ts'
import { fixtures, renderScreen, workspaceFixtures } from '../testing/renderScreen.tsx'

const { launchPlan, budget } = fixtures
const workspaceId = workspaceFixtures.harborPine.id
const main = () => screen.getByRole('main')

const actionsOf = (title: string) => screen.findByRole('button', { name: `Actions for ${title}` })
const renameDialog = () => screen.findByRole('dialog', { name: 'Rename or move' })

/** Watches what a call sends, without changing what it does. */
function spyOn<Name extends 'updateDocument' | 'archiveDocument' | 'createDocument'>(name: Name) {
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

/** Opens the Documents screen and its rename-or-move dialog for one document. */
async function openRename(title: string, options?: Parameters<typeof renderScreen>[1]) {
  const view = renderScreen('/documents', options)
  await view.user.click(await actionsOf(title))
  return { ...view, dialog: await renameDialog() }
}

describe('renaming a document', () => {
  it('sends the new title with the revision the list has, and shows the new title', async () => {
    const { requests, wrap } = spyOn('updateDocument')
    const { user, dialog } = await openRename('Autumn launch plan', { wrap })

    const title = within(dialog).getByRole('textbox', { name: 'Title' })
    await user.clear(title)
    await user.type(title, '  Winter launch plan ')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(main()).findByRole('link', { name: 'Winter launch plan' })).toBeInTheDocument()
    expect(requests.map((request) => request?.body)).toEqual([
      { title: 'Winter launch plan', revision: launchPlan.revision },
    ])
  })

  it('marks stale exactly what the table of the contract says', async () => {
    const { user, dialog, invalidatedKeys } = await openRename('Autumn launch plan')

    const title = within(dialog).getByRole('textbox', { name: 'Title' })
    await user.type(title, ' v2')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(invalidatedKeys()).toEqual(
        keysAfterMutation('updateDocument', { workspaceId, documentId: launchPlan.id }),
      ),
    )
  })

  it('puts the focus back on the button that opened the dialog', async () => {
    const { user, dialog } = await openRename('Autumn launch plan')

    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), ' v2')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rename or move' })).not.toBeInTheDocument())
    expect(await actionsOf('Autumn launch plan v2')).toHaveFocus()
  })

  it('sends nothing when nothing changed', async () => {
    const { requests, wrap } = spyOn('updateDocument')
    const { user, dialog } = await openRename('Autumn launch plan', { wrap })

    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rename or move' })).not.toBeInTheDocument())
    expect(requests).toEqual([])
  })

  it.each([
    { name: 'empty', typed: '   ', message: 'Give the document a title.' },
    {
      name: 'longer than the contract allows',
      typed: 'x'.repeat(201),
      message: 'A title can have up to 200 characters.',
    },
  ])('says so next to the field, and sends nothing, when the title is $name', async ({ typed, message }) => {
    const { requests, wrap } = spyOn('updateDocument')
    const { user, dialog } = await openRename('Autumn launch plan', { wrap })

    const title = within(dialog).getByRole('textbox', { name: 'Title' })
    await user.clear(title)
    await user.click(title)
    await user.paste(typed)
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    expect(title).toBeInvalid()
    expect(requests).toEqual([])
  })

  it('counts the length of the title in code points, as the contract does', async () => {
    const { requests, wrap } = spyOn('updateDocument')
    const { user, dialog } = await openRename('Autumn launch plan', { wrap })

    const title = within(dialog).getByRole('textbox', { name: 'Title' })
    await user.clear(title)
    await user.click(title)
    // 200 emoji are 400 UTF-16 units and 200 code points: the longest title there is.
    await user.paste('😀'.repeat(200))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(requests).toHaveLength(1))
  })
})

describe('a rename that meets a change somebody else made', () => {
  /** Daniel edits the launch plan too: he renames it before Marta saves. */
  async function danielRenames(server: ReturnType<typeof renderScreen>['server']) {
    await server.connect({ signedInAs: daniel.email }).updateDocument({
      params: { path: { documentId: launchPlan.id } },
      body: { title: 'Daniel’s title', revision: launchPlan.revision },
    })
  }

  it('says it was changed, keeps what was typed and keeps the dialog open', async () => {
    const { user, dialog, server } = await openRename('Autumn launch plan')
    await danielRenames(server)

    const title = within(dialog).getByRole('textbox', { name: 'Title' })
    await user.clear(title)
    await user.type(title, 'Marta’s title')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Someone else changed this just now')
    expect(title).toHaveValue('Marta’s title')
    expect(dialog).toHaveAttribute('open')
  })

  it('goes through on the next try, with the revision the server holds now', async () => {
    const { requests, wrap } = spyOn('updateDocument')
    const { user, dialog, server } = await openRename('Autumn launch plan', { wrap })
    await danielRenames(server)

    const title = within(dialog).getByRole('textbox', { name: 'Title' })
    await user.clear(title)
    await user.type(title, 'Marta’s title')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await within(dialog).findByRole('alert')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(main()).findByRole('link', { name: 'Marta’s title' })).toBeInTheDocument()
    expect(requests.map((request) => request?.body.revision)).toEqual([launchPlan.revision, launchPlan.revision + 1])
  })

  it('reads the lists again, so the person sees what changed', async () => {
    const { user, dialog, server, invalidatedKeys } = await openRename('Autumn launch plan')
    await danielRenames(server)

    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), ' v2')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await within(dialog).findByRole('alert')

    expect(invalidatedKeys()).toEqual(keysAfterMutation('updateDocument', { workspaceId, documentId: launchPlan.id }))
  })
})

describe('moving a document to a folder', () => {
  it('sends the folder and nothing else', async () => {
    const { requests, wrap } = spyOn('updateDocument')
    const { user, dialog } = await openRename('Autumn launch plan', { wrap })

    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Folder' }), 'Research')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]?.body).toEqual({ folderId: workspaceFixtures.researchFolder.id, revision: launchPlan.revision })
  })

  it('takes the document out of its folder with a null folder', async () => {
    const { requests, wrap } = spyOn('updateDocument')
    const { user, dialog } = await openRename('Autumn launch plan', { wrap })

    expect(within(dialog).getByRole('combobox', { name: 'Folder' })).toHaveDisplayValue('Product')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Folder' }), 'No folder')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]?.body).toEqual({ folderId: null, revision: launchPlan.revision })
  })
})

describe('who is offered the actions', () => {
  it('offers them on the documents the person can change, and not on the ones they can only read', async () => {
    renderScreen('/documents', { signedInAs: daniel.email })

    expect(await actionsOf('Autumn launch plan')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `Actions for ${budget.title}` })).not.toBeInTheDocument()
  })

  it('offers archiving only to an owner of the document', async () => {
    const { user } = renderScreen('/documents', { signedInAs: daniel.email })
    await user.click(await actionsOf('Autumn launch plan'))

    const dialog = await renameDialog()

    expect(within(dialog).queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
  })
})

describe('archiving a document', () => {
  async function openArchive(title: string, options?: Parameters<typeof renderScreen>[1]) {
    const view = await openRename(title, options)
    await view.user.click(within(view.dialog).getByRole('button', { name: 'Archive' }))
    return { ...view, confirmation: await screen.findByRole('dialog', { name: `Archive “${title}”?` }) }
  }

  it('cannot be closed while the archive is on its way', async () => {
    let answer: (() => void) | undefined
    const { user, confirmation } = await openArchive('Autumn launch plan', {
      wrap: (dataSource) => ({
        ...dataSource,
        archiveDocument: (request) =>
          new Promise((resolve) => (answer = () => resolve(dataSource.archiveDocument(request)))),
      }),
    })
    await user.click(within(confirmation).getByRole('button', { name: 'Archive' }))

    expect(within(confirmation).getByRole('button', { name: 'Close' })).toBeDisabled()
    fireEvent(confirmation, new Event('cancel', { cancelable: true }))
    expect(screen.getByRole('dialog', { name: 'Archive “Autumn launch plan”?' })).toBeInTheDocument()

    await act(async () => answer?.())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() =>
      expect(within(main()).queryByRole('link', { name: 'Autumn launch plan' })).not.toBeInTheDocument(),
    )
  })

  it('asks first, and does not archive when the person says no', async () => {
    const { requests, wrap } = spyOn('archiveDocument')
    const { user, confirmation } = await openArchive('Autumn launch plan', { wrap })

    await user.click(within(confirmation).getByRole('button', { name: 'Close' }))

    expect(requests).toEqual([])
    expect(within(main()).getByRole('link', { name: 'Autumn launch plan' })).toBeInTheDocument()
  })

  it('archives it, takes it out of the list and says so', async () => {
    const { user, confirmation } = await openArchive('Autumn launch plan')

    await user.click(within(confirmation).getByRole('button', { name: 'Archive' }))

    await waitFor(() =>
      expect(within(main()).queryByRole('link', { name: 'Autumn launch plan' })).not.toBeInTheDocument(),
    )
    await waitFor(() =>
      expect(
        within(main())
          .getAllByRole('status')
          .map((region) => region.textContent),
      ).toContain('“Autumn launch plan” was archived.'),
    )
  })

  it('marks stale exactly what the table of the contract says', async () => {
    const { user, confirmation, invalidatedKeys } = await openArchive('Autumn launch plan')

    await user.click(within(confirmation).getByRole('button', { name: 'Archive' }))

    await waitFor(() =>
      expect(invalidatedKeys()).toEqual(
        keysAfterMutation('archiveDocument', { workspaceId, documentId: launchPlan.id }),
      ),
    )
  })

  it('leaves the focus on the page, not on the body, when the row it came from is gone', async () => {
    const { user, confirmation } = await openArchive('Autumn launch plan')

    await user.click(within(confirmation).getByRole('button', { name: 'Archive' }))

    await waitFor(() =>
      expect(within(main()).queryByRole('link', { name: 'Autumn launch plan' })).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Documents' })).toHaveFocus())
  })

  it('says why it could not, in the language of the person, and keeps the document', async () => {
    const { user, confirmation } = await openArchive('Autumn launch plan', {
      wrap: (dataSource) => ({
        ...dataSource,
        archiveDocument: async () => {
          throw new ApiError({ type: 'about:blank', title: 'Forbidden', status: 403, code: 'forbidden' })
        },
      }),
    })

    await user.click(within(confirmation).getByRole('button', { name: 'Archive' }))

    expect(await within(confirmation).findByRole('alert')).toHaveTextContent("You don't have permission to do that.")
    expect(within(main()).getByRole('link', { name: 'Autumn launch plan' })).toBeInTheDocument()
  })
})

describe('creating a document', () => {
  it('creates a blank one in the workspace and opens it', async () => {
    const { requests, wrap } = spyOn('createDocument')
    const { user, router } = renderScreen('/documents', { wrap })

    await user.click(await screen.findByRole('button', { name: 'New document', description: '' }))

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/documents\/[0-9a-f-]{36}$/))
    expect(requests.map((request) => request?.body)).toEqual([{ title: 'Untitled document' }])
  })

  it('marks stale exactly what the table of the contract says', async () => {
    const { user, router, invalidatedKeys } = renderScreen('/documents')

    await user.click(await screen.findByRole('button', { name: 'New document', description: '' }))

    await waitFor(() => expect(router.state.location.pathname).not.toBe('/documents'))
    const created = router.state.location.pathname.split('/').at(-1) ?? ''
    expect(invalidatedKeys()).toEqual(keysAfterMutation('createDocument', { workspaceId, documentId: created }))
  })

  it('says why it could not, and stays where it is', async () => {
    const { user, router } = renderScreen('/documents', {
      wrap: (dataSource) => ({
        ...dataSource,
        createDocument: async () => {
          throw new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })
        },
      }),
    })

    await user.click(await screen.findByRole('button', { name: 'New document', description: '' }))

    expect(await within(main()).findByRole('alert')).toHaveTextContent('Draftroom is unavailable right now.')
    expect(router.state.location.pathname).toBe('/documents')
  })
})
