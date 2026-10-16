import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { daniel } from '../../data/mock/fixtures/index.ts'
import { answer, dialog, launchPlan, renderScreen, roleOf } from './testing/openShare.tsx'

const editorPath = `/documents/${launchPlan.id}`
const shareButton = () => screen.findByRole('button', { name: 'Share' })

/** Opens the editor of the launch plan as its owner and the share dialog from the button, as a person does. */
async function openFromButton(options?: Parameters<typeof renderScreen>[1]) {
  const view = renderScreen(editorPath, options)
  const button = await shareButton()
  await view.user.click(button)
  const share = await dialog()
  return { ...view, button, share }
}

describe('the Share button of the editor', () => {
  it('is offered to an owner, and opens the dialog on its own route', async () => {
    const { router, share } = await openFromButton()

    expect(router.state.location.pathname).toBe(`${editorPath}/share`)
    expect(share).toBeInTheDocument()
  })

  it.each([
    { role: 'an editor', email: daniel.email },
    { role: 'a commenter', email: 'sofia@harborpine.example' },
  ])('is not offered to $role: they cannot change who has access', async ({ email }) => {
    renderScreen(editorPath, { signedInAs: email })

    await screen.findByRole('textbox', { name: 'Document title' })
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
  })
})

describe('the focus around the share dialog', () => {
  it('goes back to the Share button when the dialog is closed with its Done button', async () => {
    const { button, share, user } = await openFromButton()

    await user.click(within(share).getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(button).toHaveFocus()
  })

  it('goes back to the Share button when the dialog is cancelled, as Escape does', async () => {
    const { button, share } = await openFromButton()

    fireEvent(share, new Event('cancel', { cancelable: true }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(button).toHaveFocus()
  })

  it('goes back to the Share button when the person goes Back in the browser', async () => {
    const { button, router } = await openFromButton()

    await act(() => router.navigate(-1))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(button).toHaveFocus()
  })

  it('goes back to the Share button after a deep link: the dialog was opened without it', async () => {
    const { user, router } = renderScreen(`${editorPath}/share`)
    const share = await dialog()
    await user.click(within(share).getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(editorPath))
    expect(await shareButton()).toHaveFocus()
  })

  it('goes to the headline when the own role of the person is lowered while the dialog is open, and the button is gone', async () => {
    // The server's answer after the next change: the person is an editor now, and the list is not theirs to read.
    let lowered = false
    const { user, share } = await openFromButton({
      wrap: (dataSource) => ({
        ...dataSource,
        getDocument: async (request) => {
          const document = await dataSource.getDocument(request)
          return lowered ? { ...document, role: 'editor', generalAccess: null } : document
        },
        listAccess: async (request) => {
          if (lowered) throw answer(403, 'forbidden')
          return dataSource.listAccess(request)
        },
        setAccess: async (request) => {
          lowered = true
          return dataSource.setAccess(request)
        },
      }),
    })

    await within(share).findByRole('combobox', { name: 'Role of Sofía Lindqvist' })
    await user.selectOptions(roleOf(share, 'Sofía Lindqvist'), 'editor')
    expect(await within(share).findByText('Only owners can change who has access')).toBeInTheDocument()
    await user.click(within(share).getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
  })
})

describe('the history around the share dialog', () => {
  it('does not open the dialog again when the person goes Back after closing it', async () => {
    const { share, user, router } = await openFromButton()
    await user.click(within(share).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await act(() => router.navigate(-1))

    expect(router.state.location.pathname).toBe(editorPath)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('puts the editor in the place of a dialog that was opened from its address, so Back leaves it behind', async () => {
    const { user, router } = renderScreen(`${editorPath}/share`)
    const share = await dialog()

    await user.click(within(share).getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(editorPath))
    expect(router.state.historyAction).toBe('REPLACE')
  })
})

describe('the editor behind the share dialog', () => {
  it('is the same one after the dialog opens and closes: its text and connection are not made again', async () => {
    const { user, share } = await openFromButton()
    const text = screen.getByRole('textbox', { name: 'Document content', hidden: true })

    await user.click(within(share).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(screen.getByRole('textbox', { name: 'Document content' })).toBe(text)
  })

  it('takes the dialog with it when the access to the document is removed while it is open, and says so', async () => {
    const { server, share } = await openFromButton()
    expect(share).toBeInTheDocument()

    act(() => server.collaboration.closeConnections(4403, 'access-revoked'))

    expect(await screen.findByText('Your access to this document was removed')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
    expect(document.body).not.toHaveFocus()
  })
})
