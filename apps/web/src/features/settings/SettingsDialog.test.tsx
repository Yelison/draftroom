import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { dialog, openSettings, refusal, renderScreen } from './testing/openSettings.tsx'

const person = () => screen.getByRole('button', { name: 'Marta Ruiz' })
const settingsDialog = () => screen.queryByRole('dialog', { name: 'Settings' })

/** What the browser does on Escape: it cancels the modal dialog, which jsdom does not do for a key press. */
const pressEscape = () => fireEvent(dialog(), new Event('cancel', { cancelable: true }))

/** Opens Settings the way a person does: the menu of the person in the rail, and its first item. */
async function openFromMenu(path: string) {
  const view = renderScreen(path)
  await view.user.click(await screen.findByRole('button', { name: 'Marta Ruiz' }))
  await view.user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Settings' }))
  await screen.findByRole('dialog', { name: 'Settings' })
  return view
}

describe('opening and closing Settings', () => {
  it('adds ?settings=profile to the address of the page the person is on, and keeps the page behind it', async () => {
    const { router } = await openFromMenu('/documents')

    expect(router.state.location.pathname).toBe('/documents')
    expect(router.state.location.search).toBe('?settings=profile')
    expect(screen.getByRole('heading', { level: 1, name: 'Documents' })).toBeInTheDocument()
  })

  it('keeps the page behind as the very same element, which is what keeps an editor and its document alive', async () => {
    const view = renderScreen('/documents/new')
    const headline = await screen.findByRole('heading', { level: 1, name: 'New document' })

    await view.user.click(await screen.findByRole('button', { name: 'Marta Ruiz' }))
    await view.user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Settings' }))
    await screen.findByRole('dialog', { name: 'Settings' })

    expect(screen.getByRole('heading', { level: 1, name: 'New document', hidden: true })).toBe(headline)
    expect(headline).toBeInTheDocument()
  })

  it('keeps the rest of the address, and gives it back when the dialog closes', async () => {
    const { user, router } = await openFromMenu('/search?q=budget')
    expect(router.state.location.search).toBe('?q=budget&settings=profile')

    await user.click(within(dialog()).getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(settingsDialog()).not.toBeInTheDocument())
    expect(router.state.location.search).toBe('?q=budget')
  })

  it.each([
    { how: 'Escape', close: () => pressEscape() },
    {
      how: 'the Done button',
      close: (user: ReturnType<typeof renderScreen>['user']) =>
        user.click(within(dialog()).getByRole('button', { name: 'Done' })),
    },
    {
      how: 'the Back button of the browser',
      close: (_user: ReturnType<typeof renderScreen>['user'], router?: ReturnType<typeof renderScreen>['router']) =>
        router?.navigate(-1),
    },
  ])('closes with $how, back on the same page with the focus on the person', async ({ close }) => {
    const { user, router } = await openFromMenu('/documents')

    await close(user, router)

    await waitFor(() => expect(settingsDialog()).not.toBeInTheDocument())
    expect(router.state.location.search).toBe('')
    expect(router.state.location.pathname).toBe('/documents')
    expect(person()).toHaveFocus()
  })

  it('leaves the history as it was: Back after closing does not open it again', async () => {
    const { user, router } = renderScreen('/')
    await user.click(await screen.findByRole('link', { name: 'Documents' }))
    await user.click(await screen.findByRole('button', { name: 'Marta Ruiz' }))
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Settings' }))
    await screen.findByRole('dialog', { name: 'Settings' })
    pressEscape()
    await waitFor(() => expect(settingsDialog()).not.toBeInTheDocument())

    await router.navigate(-1)

    expect(router.state.location.pathname).toBe('/')
    expect(settingsDialog()).not.toBeInTheDocument()
  })
})

describe('an address that names Settings', () => {
  it('opens the dialog over Home', async () => {
    const { router } = renderScreen('/?settings=profile')

    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Home', hidden: true })).toBeInTheDocument()
  })

  it('has the focus return to the person when it was the first thing opened and then closes', async () => {
    const { user } = await openSettings()

    await user.click(within(dialog()).getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(settingsDialog()).not.toBeInTheDocument())
    expect(person()).toHaveFocus()
  })

  it('replaces the entry when it closes, so Back does not come back to the open dialog', async () => {
    const { router } = await openSettings()

    pressEscape()
    await waitFor(() => expect(settingsDialog()).not.toBeInTheDocument())

    expect(router.state.location.search).toBe('')
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it.each([
    { from: '/settings', section: 'profile' },
    { from: '/settings/profile', section: 'profile' },
    { from: '/settings/appearance', section: 'appearance' },
    { from: '/settings/workspace', section: 'workspace' },
  ])('opens the dialog over Home for the old address $from', async ({ from, section }) => {
    const { router } = renderScreen(from)

    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.location.search).toBe(`?settings=${section}`)
  })

  it('sends /settings/members to the Members page, with no dialog', async () => {
    const { router } = renderScreen('/settings/members')

    expect(await screen.findByRole('heading', { level: 1, name: 'Members' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/members')
    expect(settingsDialog()).not.toBeInTheDocument()
  })

  it('opens at the top for a value it does not know', async () => {
    const { router } = renderScreen('/?settings=nonsense')

    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?settings=nonsense')
    await within(dialog()).findByRole('heading', { level: 2, name: 'Profile' })
  })

  it.each([
    { section: 'profile', first: 'Name' },
    { section: 'appearance', first: 'Light' },
    { section: 'workspace', first: 'Workspace name' },
  ])('puts the focus on the first control of the section it names: $section', async ({ section, first }) => {
    renderScreen(`/?settings=${section}`)

    await within(await screen.findByRole('dialog', { name: 'Settings' })).findByRole('heading', {
      level: 2,
      name: 'Profile',
    })

    await waitFor(() => expect(within(dialog()).getByLabelText(first)).toHaveFocus())
  })
})

describe('the sections of the dialog', () => {
  it('has the three of them in one column, in their order, under the name of the dialog', async () => {
    await openSettings()

    expect(
      within(dialog())
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Settings', 'Profile', 'Appearance', 'Workspace'])
    expect(within(dialog()).getByText('Your choices are saved as soon as you make them.')).toBeInTheDocument()
  })

  it('has Save changes available once something changed, and not again once it is stored', async () => {
    const { user } = await openSettings()
    const save = () => within(dialog()).getByRole('button', { name: 'Save changes' })
    expect(save()).toHaveAttribute('aria-disabled', 'true')

    await user.type(within(dialog()).getByRole('textbox', { name: 'Name' }), ' Vega')
    expect(save()).not.toHaveAttribute('aria-disabled')
    await user.click(save())

    expect(await within(dialog()).findByText('Changes saved')).toBeInTheDocument()
    expect(save()).toHaveAttribute('aria-disabled', 'true')
    await user.type(within(dialog()).getByRole('textbox', { name: 'Name' }), '!')
    expect(within(dialog()).queryByText('Changes saved')).not.toBeInTheDocument()
  })

  it('saves the name and the workspace name together with one Save changes, and says so once both are stored', async () => {
    const { user, server } = await openSettings()
    await user.type(within(dialog()).getByRole('textbox', { name: 'Name' }), ' Vega')
    await user.type(within(dialog()).getByRole('textbox', { name: 'Workspace name' }), ' Studio')

    await user.click(within(dialog()).getByRole('button', { name: 'Save changes' }))

    expect(await within(dialog()).findByText('Changes saved')).toBeInTheDocument()
    const stored = server.connect({ signedInAs: 'marta@harborpine.example' })
    expect((await stored.getMe()).name).toBe('Marta Ruiz Vega')
  })

  it('does not say saved when one of the two requests failed, and puts the failure on its own field', async () => {
    const { user } = await openSettings({
      wrap: (dataSource) => ({ ...dataSource, updateWorkspace: () => Promise.reject(refusal(403, 'forbidden')) }),
    })
    await user.type(within(dialog()).getByRole('textbox', { name: 'Name' }), ' Vega')
    await user.type(within(dialog()).getByRole('textbox', { name: 'Workspace name' }), ' Studio')

    await user.click(within(dialog()).getByRole('button', { name: 'Save changes' }))

    const workspaceName = within(dialog()).getByRole('textbox', { name: 'Workspace name' })
    expect(await within(dialog()).findByText("You don't have permission to do that.")).toBeInTheDocument()
    expect(workspaceName).toHaveAccessibleDescription("You don't have permission to do that.")
    expect(within(dialog()).getByRole('textbox', { name: 'Name' })).not.toHaveAccessibleDescription(/permission/)
    expect(within(dialog()).queryByText('Changes saved')).not.toBeInTheDocument()
  })

  it('ties the failure of the language to its group', async () => {
    const { user } = await openSettings({
      wrap: (dataSource) => ({ ...dataSource, updateMe: () => Promise.reject(refusal(503, 'unavailable')) }),
    })
    await user.click(within(dialog()).getByRole('radio', { name: 'Español' }))

    await user.click(within(dialog()).getByRole('button', { name: 'Save changes' }))

    await within(dialog()).findByText(/Draftroom is unavailable right now/)
    expect(within(dialog()).getByRole('group', { name: 'Language' })).toHaveAccessibleDescription(
      /Draftroom is unavailable right now/,
    )
  })

  it('shows the state of saving: Save changes is busy while a request is on its way', async () => {
    let answer: () => void = () => undefined
    const { user } = await openSettings({
      wrap: (dataSource) => ({
        ...dataSource,
        updateMe: (request) => new Promise((resolve) => (answer = () => resolve(dataSource.updateMe(request)))),
      }),
    })
    await user.type(within(dialog()).getByRole('textbox', { name: 'Name' }), ' Vega')

    await user.click(within(dialog()).getByRole('button', { name: 'Save changes' }))

    expect(await within(dialog()).findByRole('button', { name: 'Loading…' })).toHaveAttribute('aria-busy', 'true')
    answer()
    expect(await within(dialog()).findByText('Changes saved')).toBeInTheDocument()
  })

  it('gives the focus to the headline of the page, not to the body, when it closes with no person to give it to', async () => {
    const { user } = renderScreen('/?settings=profile', {
      wrap: (dataSource) => ({ ...dataSource, getMe: () => Promise.reject(refusal(503, 'unavailable')) }),
    })
    const open = within(await screen.findByRole('dialog', { name: 'Settings' }))
    await open.findByRole('alert')

    await user.click(open.getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(settingsDialog()).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toHaveFocus()
  })

  it('keeps the dialog and its Done button while the data is on its way', async () => {
    renderScreen('/?settings=profile', {
      wrap: (dataSource) => ({ ...dataSource, getMe: () => new Promise(() => undefined) }),
    })

    const open = await screen.findByRole('dialog', { name: 'Settings' })

    expect(within(open).getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(within(open).getByText('Loading your settings')).toHaveAttribute('role', 'status')
    expect(within(open).getByRole('button', { name: 'Save changes' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('is said in Spanish when the app is in Spanish', async () => {
    localStorage.setItem('draftroom-locale', 'es')
    renderScreen('/?settings=profile')

    const open = await screen.findByRole('dialog', { name: 'Configuración' })

    expect(await within(open).findByText('Tus elecciones se guardan en cuanto las haces.')).toBeInTheDocument()
    localStorage.clear()
  })
})
