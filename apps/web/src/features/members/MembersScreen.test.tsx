import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { ana, daniel, marta, sofia } from '../../data/mock/fixtures/index.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { main, openMembers, refusal, renderScreen, roleOf, rowOf } from './testing/openMembers.tsx'

const headline = () => screen.getByRole('heading', { level: 1, name: 'Members' })
const chip = (name: string) => within(main()).getByRole('button', { name })
const bodyRows = () => within(main()).getAllByRole('row').slice(1)

/** The same workspace without its invitations, for the filter that would then have nobody to show. */
const withoutPending = (dataSource: DataSource): DataSource => ({
  ...dataSource,
  listMembers: async (request) => {
    const page = await dataSource.listMembers(request)
    return { ...page, items: page.items.filter((member) => member.status === 'active') }
  },
})

describe('the Members page', () => {
  it('lists everyone in a table of member, role, status and date, with the person who has not signed up pending', async () => {
    await openMembers()

    expect(
      within(main())
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Member', 'Role', 'Status', 'Joined', 'Actions'])
    expect(bodyRows().map((row) => row.textContent)).toEqual([
      expect.stringContaining('Marta Ruiz (you)'),
      expect.stringContaining('Daniel Okafor'),
      expect.stringContaining('Sofía Lindqvist'),
      expect.stringContaining(`${ana.email}Member`),
    ])
    expect(within(rowOf('Daniel Okafor')).getByText('Active')).toBeInTheDocument()
    expect(within(rowOf(ana.email)).getByText('Pending')).toBeInTheDocument()
  })

  it('counts the people who have signed up and the invitations still waiting', async () => {
    await openMembers()

    expect(within(main()).getByText('3 members, 1 pending')).toBeInTheDocument()
  })

  it('says since when a person belongs, and since when an invitation has been waiting', async () => {
    await openMembers()

    const joined = within(rowOf('Daniel Okafor')).getByText(/\d{4}/)
    expect(joined.tagName).toBe('TIME')
    const instant = joined.getAttribute('datetime') ?? ''
    expect(joined).toHaveTextContent(new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(instant)))
    expect(within(rowOf(ana.email)).getByText(/^Invited /)).toBeInstanceOf(HTMLTimeElement)
  })

  it('names the page with one headline, which is the title of the tab', async () => {
    await openMembers()

    expect(headline()).toBeInTheDocument()
    expect(document.title).toBe('Members · Draftroom')
  })

  describe('the filters', () => {
    it('offer everyone, the owners and the pending, with everyone chosen', async () => {
      await openMembers()

      const group = within(main()).getByRole('group', { name: 'Show' })
      expect(
        within(group)
          .getAllByRole('button')
          .map((button) => [button.textContent, button.getAttribute('aria-pressed')]),
      ).toEqual([
        ['Everyone', 'true'],
        ['Owners', 'false'],
        ['Pending', 'false'],
      ])
    })

    it.each([
      ['Owners', ['Marta Ruiz (you)']],
      ['Pending', [ana.email]],
      ['Everyone', ['Marta Ruiz (you)', 'Daniel Okafor', 'Sofía Lindqvist', ana.email]],
    ])('show only %s, and keep the count of the whole workspace', async (name, shown) => {
      const { user } = await openMembers()
      await user.click(chip('Pending'))

      await user.click(chip(name))

      expect(chip(name)).toHaveAttribute('aria-pressed', 'true')
      expect(bodyRows().map((row) => row.textContent)).toEqual(shown.map((text) => expect.stringContaining(text)))
      expect(within(main()).getByText('3 members, 1 pending')).toBeInTheDocument()
    })

    it('say so when nobody is left to show, and bring the table back with another choice', async () => {
      const { user } = await openMembers({ wrap: withoutPending })

      await user.click(chip('Pending'))

      expect(within(main()).getByText('Nobody has an invitation pending.')).toBeInTheDocument()
      expect(within(main()).queryByRole('table')).not.toBeInTheDocument()
      await user.click(chip('Everyone'))
      expect(within(main()).getByRole('table')).toBeInTheDocument()
    })

    it('keep the focus on the headline when a change takes the row out of the filter', async () => {
      const { user } = await openMembers()
      await user.selectOptions(roleOf('Daniel Okafor'), 'Owner')
      await within(main()).findByText('The role of Daniel Okafor is now Owner.')
      await user.click(chip('Owners'))

      await user.selectOptions(roleOf('Daniel Okafor'), 'Member')

      expect(await within(main()).findByText('The role of Daniel Okafor is now Member.')).toBeInTheDocument()
      expect(within(main()).queryByRole('row', { name: /Daniel Okafor/ })).not.toBeInTheDocument()
      expect(headline()).toHaveFocus()
    })

    it('hold the last owner in the Owners filter too', async () => {
      const { user } = await openMembers()

      await user.click(chip('Owners'))

      expect(roleOf('Marta Ruiz')).toHaveAttribute('aria-disabled', 'true')
    })
  })

  describe('inviting', () => {
    it('invites somebody by email with a role, says so, and lists them as pending', async () => {
      const { user } = await openMembers()

      await user.type(within(main()).getByRole('textbox', { name: 'Email' }), 'idris@harborpine.example')
      await user.selectOptions(within(main()).getByRole('combobox', { name: 'Role' }), 'Owner')
      await user.click(within(main()).getByRole('button', { name: 'Invite' }))

      expect(await within(main()).findByText('idris@harborpine.example was invited as Owner.')).toBeInTheDocument()
      expect(within(rowOf('idris@harborpine.example')).getByText('Pending')).toBeInTheDocument()
      expect(within(main()).getByText('3 members, 2 pending')).toBeInTheDocument()
      expect(within(main()).getByRole('textbox', { name: 'Email' })).toHaveValue('')
    })

    it.each([
      ['an empty address', '', 'Enter an email address.'],
      ['an address without a domain', 'idris', 'Enter a valid email address.'],
    ])('asks for a valid address before it sends anything: %s', async (_name, address, message) => {
      let calls = 0
      const { user } = await openMembers({
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
      const { user } = await openMembers()

      await user.type(within(main()).getByRole('textbox', { name: 'Email' }), daniel.email)
      await user.click(within(main()).getByRole('button', { name: 'Invite' }))

      expect(await within(main()).findByRole('alert')).toHaveTextContent(
        'That person already belongs to this workspace.',
      )
      expect(within(main()).getByRole('textbox', { name: 'Email' })).toHaveValue(daniel.email)
    })
  })

  describe('roles', () => {
    it('are chosen by an owner, who is told once the server has stored the change', async () => {
      const { user } = await openMembers()

      await user.selectOptions(roleOf('Daniel Okafor'), 'Owner')

      expect(await within(main()).findByText('The role of Daniel Okafor is now Owner.')).toBeInTheDocument()
      expect(roleOf('Daniel Okafor')).toHaveValue('owner')
    })

    it('are read as a label by a member, who can choose nothing', async () => {
      await openMembers({ signedInAs: sofia.email })

      expect(within(rowOf('Marta Ruiz')).getByText('Owner')).toBeInTheDocument()
      expect(within(rowOf('Daniel Okafor')).getByText('Member')).toBeInTheDocument()
      expect(within(main()).queryByRole('combobox')).not.toBeInTheDocument()
    })
  })

  describe('the only owner', () => {
    it('cannot be given a lower role: the control is held and the row says why', async () => {
      let calls = 0
      const { user } = await openMembers({
        wrap: (dataSource) => ({
          ...dataSource,
          updateMember: (request) => {
            calls++
            return dataSource.updateMember(request)
          },
        }),
      })

      expect(roleOf('Marta Ruiz')).toHaveAttribute('aria-disabled', 'true')
      expect(within(rowOf('Marta Ruiz')).getByText(/Last owner\. Give the owner role to someone else/)).toBeVisible()
      await user.selectOptions(roleOf('Marta Ruiz'), 'Member')

      expect(calls).toBe(0)
    })

    it('stays protected while the other owner is still pending: only an owner who has signed up can act', async () => {
      const { user } = await openMembers()
      await user.type(within(main()).getByRole('textbox', { name: 'Email' }), 'idris@harborpine.example')
      await user.selectOptions(within(main()).getByRole('combobox', { name: 'Role' }), 'Owner')
      await user.click(within(main()).getByRole('button', { name: 'Invite' }))
      await within(main()).findByText('idris@harborpine.example was invited as Owner.')

      expect(roleOf('Marta Ruiz')).toHaveAttribute('aria-disabled', 'true')
      expect(within(main()).getByText(/Last owner\. Give the owner role to someone else/)).toBeInTheDocument()
    })

    it('is free to step down once somebody else is an owner too', async () => {
      const { user } = await openMembers()

      await user.selectOptions(roleOf('Daniel Okafor'), 'Owner')
      await within(main()).findByText('The role of Daniel Okafor is now Owner.')

      expect(roleOf('Marta Ruiz')).not.toHaveAttribute('aria-disabled')
      expect(within(main()).queryByText(/Last owner\./)).not.toBeInTheDocument()
    })

    it('hands the focus to the headline and says so when stepping down takes the controls away', async () => {
      const { user } = await openMembers()
      await user.selectOptions(roleOf('Daniel Okafor'), 'Owner')
      await within(main()).findByText('The role of Daniel Okafor is now Owner.')

      await user.selectOptions(roleOf('Marta Ruiz'), 'Member')

      expect(await within(main()).findByText('You are no longer an owner of this workspace.')).toBeInTheDocument()
      expect(within(main()).queryByRole('combobox')).not.toBeInTheDocument()
      expect(within(main()).queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
      expect(headline()).toHaveFocus()
    })

    it('is protected by the server too, which says so in its own words when a change slips through', async () => {
      const { user } = await openMembers({
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
      const { user } = await openMembers()

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
      expect(headline()).toHaveFocus()
    })

    it('leaves everybody where they are, and the focus on the button, when it is cancelled', async () => {
      const { user } = await openMembers()
      const trigger = within(main()).getByRole('button', { name: 'Remove Sofía Lindqvist' })

      await user.click(trigger)
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Close' }))

      expect(trigger).toHaveFocus()
      expect(within(main()).getByText('Sofía Lindqvist')).toBeInTheDocument()
    })

    it('says what went wrong when the server refuses, and closes the question', async () => {
      const { user } = await openMembers({
        wrap: (dataSource) => ({ ...dataSource, removeMember: () => Promise.reject(refusal(409, 'last-owner')) }),
      })

      await user.click(within(main()).getByRole('button', { name: 'Remove Sofía Lindqvist' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }))

      expect(await within(main()).findByRole('alert')).toHaveTextContent('A workspace needs at least one owner.')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does not offer to remove yourself', async () => {
      await openMembers()

      expect(within(main()).queryByRole('button', { name: 'Remove Marta Ruiz' })).not.toBeInTheDocument()
      expect(within(rowOf('Marta Ruiz')).queryByRole('button')).not.toBeInTheDocument()
    })
  })

  it('shows a member who is not an owner the list, without a way to change anything', async () => {
    await openMembers({ signedInAs: sofia.email })

    expect(
      within(main()).getByText('Only owners can invite people, change roles or remove members.'),
    ).toBeInTheDocument()
    expect(within(main()).queryByRole('form')).not.toBeInTheDocument()
    expect(within(main()).queryByRole('button', { name: 'Invite' })).not.toBeInTheDocument()
    expect(within(main()).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(main()).queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument()
    expect(within(main()).queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
    expect(within(main()).getByText(marta.name ?? '')).toBeInTheDocument()
  })

  it('tells a person who is alone in the workspace so, under their own row and with no filters to choose', async () => {
    renderScreen('/members', {
      wrap: (dataSource) => ({
        ...dataSource,
        listMembers: async (request) => {
          const page = await dataSource.listMembers(request)
          return { ...page, items: page.items.filter((member) => member.userId === marta.id) }
        },
      }),
    })

    const notice = await within(main()).findByText('You are the only member')
    expect(bodyRows().map((row) => row.textContent)).toEqual([expect.stringContaining('Marta Ruiz (you)')])
    expect(within(main()).getByText(/Last owner\. Give the owner role to someone else/)).toBeInTheDocument()
    expect(within(main()).getByRole('table').compareDocumentPosition(notice)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(within(main()).queryByRole('group', { name: 'Show' })).not.toBeInTheDocument()
    expect(within(main()).getByRole('textbox', { name: 'Email' })).toBeInTheDocument()
  })

  it('keeps the row of a person who is left alone, whatever filter was chosen before the last invitation went', async () => {
    const { user } = renderScreen('/members', {
      wrap: (dataSource) => ({
        ...dataSource,
        listMembers: async (request) => {
          const page = await dataSource.listMembers(request)
          return {
            ...page,
            items: page.items.filter((member) => member.userId === marta.id || member.userId === ana.id),
          }
        },
      }),
    })
    await user.click(await within(main()).findByRole('button', { name: 'Pending' }))

    await user.click(within(main()).getByRole('button', { name: `Remove ${ana.email}` }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }))

    expect(await within(main()).findByText('You are the only member')).toBeInTheDocument()
    expect(bodyRows().map((row) => row.textContent)).toEqual([expect.stringContaining('Marta Ruiz (you)')])
    expect(within(main()).queryByText('Nobody has an invitation pending.')).not.toBeInTheDocument()
  })

  it('shows a skeleton with a spoken status while the members are on their way', async () => {
    renderScreen('/members', {
      wrap: (dataSource) => ({ ...dataSource, listMembers: () => new Promise(() => undefined) }),
    })

    const status = await within(main()).findByText('Loading the members')
    expect(status).toHaveAttribute('role', 'status')
    expect(status.closest('[aria-busy="true"]')).not.toBeNull()
    expect(headline()).toBeInTheDocument()
  })

  it('guesses nothing about a person whose role is not known yet: the summary only, and the rest comes under it', async () => {
    renderScreen('/members', {
      signedInAs: sofia.email,
      wrap: (dataSource) => ({
        ...dataSource,
        getWorkspace: () => new Promise(() => undefined),
        listMembers: () => new Promise(() => undefined),
      }),
    })

    const skeleton = (await within(main()).findByText('Loading the members')).closest('[aria-busy="true"]')
    // The summary and the spoken status, and no invitation, filters or table to move once the role arrives.
    expect(skeleton?.children).toHaveLength(2)
  })

  it('reserves the room of a member while the members are on their way: no invitation, and the sentence a member reads', async () => {
    renderScreen('/members', {
      signedInAs: sofia.email,
      wrap: (dataSource) => ({ ...dataSource, listMembers: () => new Promise(() => undefined) }),
    })

    await within(main()).findByText('Loading the members')

    // The skeleton is replaced once the workspace says what the person is, so it is looked up again each time.
    const skeleton = () => main().querySelector('[aria-busy="true"]')
    await waitFor(() => expect(skeleton()).toHaveTextContent('Only owners can invite people'))
    expect(skeleton()?.querySelector('[class*="invitePanel"]')).toBeNull()
  })

  it('says it could not read the members, and tries again when asked', async () => {
    let failures = 1
    const { user } = renderScreen('/members', {
      wrap: (dataSource) => ({
        ...dataSource,
        listMembers: (request) =>
          failures-- > 0 ? Promise.reject(refusal(503, 'unavailable')) : dataSource.listMembers(request),
      }),
    })

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load the members")
    await user.click(within(main()).getByRole('button', { name: 'Try again' }))

    expect(await within(main()).findByRole('table', { name: 'Members of the workspace' })).toBeInTheDocument()
    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('is written in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/members')

    expect(await screen.findByRole('heading', { level: 1, name: 'Miembros' })).toBeInTheDocument()
    await waitFor(() => expect(within(main()).getByText('3 miembros, 1 pendiente')).toBeInTheDocument())
    expect(within(main()).getByRole('group', { name: 'Mostrar' })).toBeInTheDocument()
    expect(within(main()).getByRole('columnheader', { name: 'Desde' })).toBeInTheDocument()
    expect(within(main()).getByRole('button', { name: 'Quitar a Sofía Lindqvist' })).toBeInTheDocument()
  })
})
