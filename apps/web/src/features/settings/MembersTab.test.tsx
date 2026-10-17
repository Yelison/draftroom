import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ana, daniel, marta, sofia } from '../../data/mock/fixtures/index.ts'
import { main, openTab, refusal, renderScreen } from './testing/openSettings.tsx'

const row = (name: string) => within(main()).getByText(name).closest('li')
const roleOf = (name: string) => {
  const member = row(name)
  if (member === null) throw new Error(`There is no row for ${name}`)
  return within(member).getByRole('combobox')
}

describe('the Members tab', () => {
  it('lists everyone in the workspace, with the person who has not signed up marked as pending', async () => {
    await openTab('members', 'Members')

    const names = within(main())
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(names).toEqual([
      expect.stringContaining('Marta Ruiz (you)'),
      expect.stringContaining('Daniel Okafor'),
      expect.stringContaining('Sofía Lindqvist'),
      expect.stringContaining(`${ana.email}Pending`),
    ])
  })

  it('invites somebody by email with a role, says so, and lists them as pending', async () => {
    const { user } = await openTab('members', 'Members')

    await user.type(within(main()).getByRole('textbox', { name: 'Email' }), 'idris@harborpine.example')
    await user.selectOptions(within(main()).getByRole('combobox', { name: 'Role' }), 'Owner')
    await user.click(within(main()).getByRole('button', { name: 'Invite' }))

    expect(await within(main()).findByText('idris@harborpine.example was invited as Owner.')).toBeInTheDocument()
    expect(within(main()).getByText('idris@harborpine.example')).toBeInTheDocument()
    expect(within(main()).getByRole('textbox', { name: 'Email' })).toHaveValue('')
  })

  it.each([
    ['an empty address', '', 'Enter an email address.'],
    ['an address without a domain', 'idris', 'Enter a valid email address.'],
  ])('asks for a valid address before it sends anything: %s', async (_name, address, message) => {
    let calls = 0
    const { user } = await openTab('members', 'Members', {
      wrap: (dataSource) => ({
        ...dataSource,
        addMember: (request) => {
          calls++
          return dataSource.addMember(request)
        },
      }),
    })

    if (address !== '') await user.type(within(main()).getByRole('textbox', { name: 'Email' }), address)
    await user.click(within(main()).getByRole('button', { name: 'Invite' }))

    expect(await within(main()).findByText(message)).toBeInTheDocument()
    expect(calls).toBe(0)
  })

  it('says a person already belongs to the workspace, and keeps the address that was typed', async () => {
    const { user } = await openTab('members', 'Members')

    await user.type(within(main()).getByRole('textbox', { name: 'Email' }), daniel.email)
    await user.click(within(main()).getByRole('button', { name: 'Invite' }))

    expect(await within(main()).findByRole('alert')).toHaveTextContent('That person already belongs to this workspace.')
    expect(within(main()).getByRole('textbox', { name: 'Email' })).toHaveValue(daniel.email)
  })

  it('changes the role of a member, and says so once the server has stored it', async () => {
    const { user } = await openTab('members', 'Members')

    await user.selectOptions(roleOf('Daniel Okafor'), 'Owner')

    expect(await within(main()).findByText('The role of Daniel Okafor is now Owner.')).toBeInTheDocument()
    expect(roleOf('Daniel Okafor')).toHaveValue('owner')
  })

  describe('the only owner', () => {
    it('cannot be given a lower role: the control is held and the row says why', async () => {
      let calls = 0
      const { user } = await openTab('members', 'Members', {
        wrap: (dataSource) => ({
          ...dataSource,
          updateMember: (request) => {
            calls++
            return dataSource.updateMember(request)
          },
        }),
      })

      expect(roleOf('Marta Ruiz (you)')).toHaveAttribute('aria-disabled', 'true')
      expect(within(main()).getByText(/Last owner\. Give the owner role to someone else/)).toBeInTheDocument()
      await user.selectOptions(roleOf('Marta Ruiz (you)'), 'Member')

      expect(calls).toBe(0)
    })

    it('stays protected while the other owner is still pending: only an owner who has signed up can act', async () => {
      const { user } = await openTab('members', 'Members')
      await user.type(within(main()).getByRole('textbox', { name: 'Email' }), 'idris@harborpine.example')
      await user.selectOptions(within(main()).getByRole('combobox', { name: 'Role' }), 'Owner')
      await user.click(within(main()).getByRole('button', { name: 'Invite' }))
      await within(main()).findByText('idris@harborpine.example was invited as Owner.')

      expect(roleOf('Marta Ruiz (you)')).toHaveAttribute('aria-disabled', 'true')
      expect(within(main()).getByText(/Last owner\. Give the owner role to someone else/)).toBeInTheDocument()
    })

    it('is free to step down once somebody else is an owner too', async () => {
      const { user } = await openTab('members', 'Members')

      await user.selectOptions(roleOf('Daniel Okafor'), 'Owner')
      await within(main()).findByText('The role of Daniel Okafor is now Owner.')

      expect(roleOf('Marta Ruiz (you)')).not.toHaveAttribute('aria-disabled')
      expect(within(main()).queryByText(/Last owner\./)).not.toBeInTheDocument()
    })

    it('hands the focus to the headline and says so when stepping down takes the controls away', async () => {
      const { user } = await openTab('members', 'Members')
      await user.selectOptions(roleOf('Daniel Okafor'), 'Owner')
      await within(main()).findByText('The role of Daniel Okafor is now Owner.')

      await user.selectOptions(roleOf('Marta Ruiz (you)'), 'Member')

      expect(await within(main()).findByText('You are no longer an owner of this workspace.')).toBeInTheDocument()
      expect(within(main()).queryByRole('combobox')).not.toBeInTheDocument()
      expect(within(main()).getByRole('heading', { level: 2, name: 'Members' })).toHaveFocus()
    })

    it('is protected by the server too, which says so in its own words when a change slips through', async () => {
      const { user } = await openTab('members', 'Members', {
        wrap: (dataSource) => ({ ...dataSource, updateMember: () => Promise.reject(refusal(409, 'last-owner')) }),
      })

      await user.selectOptions(roleOf('Daniel Okafor'), 'Owner')

      expect(await within(main()).findByRole('alert')).toHaveTextContent(
        'A workspace needs at least one owner. Make someone else an owner first.',
      )
    })
  })

  describe('removing a member', () => {
    it('asks first, with the way out before the action, and removes them once confirmed', async () => {
      const { user } = await openTab('members', 'Members')

      await user.click(within(main()).getByRole('button', { name: 'Remove Sofía Lindqvist' }))
      const dialog = await screen.findByRole('dialog', { name: 'Remove Sofía Lindqvist?' })
      // The browser focuses the first control of a modal dialog (Playwright checks it): the way out is first.
      expect(
        within(dialog)
          .getAllByRole('button')
          .map((button) => button.textContent),
      ).toEqual(['Close', 'Remove'])
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }))

      expect(await within(main()).findByText('Sofía Lindqvist was removed from the workspace.')).toBeInTheDocument()
      expect(within(main()).queryByRole('button', { name: 'Remove Sofía Lindqvist' })).not.toBeInTheDocument()
      expect(within(main()).getByRole('heading', { level: 2, name: 'Members' })).toHaveFocus()
    })

    it('leaves everybody where they are, and the focus on the button, when it is cancelled', async () => {
      const { user } = await openTab('members', 'Members')
      const trigger = within(main()).getByRole('button', { name: 'Remove Sofía Lindqvist' })

      await user.click(trigger)
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Close' }))

      expect(trigger).toHaveFocus()
      expect(within(main()).getByText('Sofía Lindqvist')).toBeInTheDocument()
    })

    it('says what went wrong when the server refuses, and closes the question', async () => {
      const { user } = await openTab('members', 'Members', {
        wrap: (dataSource) => ({ ...dataSource, removeMember: () => Promise.reject(refusal(409, 'last-owner')) }),
      })

      await user.click(within(main()).getByRole('button', { name: 'Remove Sofía Lindqvist' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }))

      expect(await within(main()).findByRole('alert')).toHaveTextContent('A workspace needs at least one owner.')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does not offer to remove yourself', async () => {
      await openTab('members', 'Members')

      expect(within(main()).queryByRole('button', { name: 'Remove Marta Ruiz' })).not.toBeInTheDocument()
    })
  })

  it('shows a member who is not an owner the list, without a way to change anything', async () => {
    await openTab('members', 'Members', { signedInAs: sofia.email })

    expect(
      within(main()).getByText('Only owners can invite people, change roles or remove members.'),
    ).toBeInTheDocument()
    expect(within(main()).queryByRole('button', { name: 'Invite' })).not.toBeInTheDocument()
    expect(within(main()).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(main()).queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument()
    expect(within(main()).getByText(marta.name ?? '')).toBeInTheDocument()
  })

  it('shows a skeleton with a spoken status while the members are on their way', async () => {
    renderScreen('/settings/members', {
      wrap: (dataSource) => ({ ...dataSource, listMembers: () => new Promise(() => undefined) }),
    })

    expect(await within(main()).findByText('Loading your settings')).toHaveAttribute('role', 'status')
  })

  it('says it could not read the members, and tries again when asked', async () => {
    let failures = 1
    const { user } = renderScreen('/settings/members', {
      wrap: (dataSource) => ({
        ...dataSource,
        listMembers: (request) =>
          failures-- > 0 ? Promise.reject(refusal(503, 'unavailable')) : dataSource.listMembers(request),
      }),
    })

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load your settings")
    await user.click(within(main()).getByRole('button', { name: 'Try again' }))

    expect(await within(main()).findByRole('heading', { level: 2, name: 'Members' })).toBeInTheDocument()
    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
  })
})
