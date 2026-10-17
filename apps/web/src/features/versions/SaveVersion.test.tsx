import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { daniel, launchPlan, openVersions, rows, sofia, unavailable } from './testing/openVersions.tsx'

const saveButton = () => screen.getByRole('button', { name: 'Save a version' })

/** Opens the dialog to save a version, as the person who may does. */
async function askToSave(options?: Parameters<typeof openVersions>[1]) {
  const view = await openVersions(launchPlan.id, options)
  const trigger = saveButton()
  await view.user.click(trigger)
  return { ...view, trigger, form: await screen.findByRole('dialog') }
}

describe('who is offered to save a version', () => {
  it.each([
    { role: 'an owner', email: undefined },
    { role: 'an editor', email: daniel.email },
  ])('is $role', async ({ email }) => {
    await openVersions(launchPlan.id, { signedInAs: email })

    expect(saveButton()).toBeInTheDocument()
  })

  it('is not a commenter, who can only read the versions', async () => {
    await openVersions(launchPlan.id, { signedInAs: sofia })

    expect(screen.queryByRole('button', { name: 'Save a version' })).not.toBeInTheDocument()
  })
})

describe('saving a version', () => {
  it('puts the new version first in the list under the name given, announces it and gives the focus back', async () => {
    const { trigger, form, user, invalidatedKeys } = await askToSave()

    await user.type(within(form).getByRole('textbox', { name: 'Name (optional)' }), 'Before the review')
    await user.click(within(form).getByRole('button', { name: 'Save version' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(await screen.findByText('Version saved.')).toBeInTheDocument()
    await waitFor(() => expect(rows()).toHaveLength(4))
    expect(rows()[0]).toHaveTextContent('Before the review')
    expect(invalidatedKeys()).toContainEqual(['documents', launchPlan.id, 'versions'])
  })

  it('saves it without a name when none is given, so it is not an empty one', async () => {
    const createVersion = vi.fn<DataSource['createVersion']>()
    const { form, user } = await askToSave({
      wrap: (dataSource) => ({
        ...dataSource,
        createVersion: (request) => {
          createVersion(request)
          return dataSource.createVersion(request)
        },
      }),
    })

    await user.type(within(form).getByRole('textbox', { name: 'Name (optional)' }), '   ')
    await user.click(within(form).getByRole('button', { name: 'Save version' }))

    await waitFor(() => expect(createVersion).toHaveBeenCalledTimes(1))
    expect(createVersion.mock.calls[0]?.[0]).not.toHaveProperty('body')
    expect(await screen.findByText('Version saved.')).toBeInTheDocument()
  })

  it('keeps the dialog and what was typed when the server could not save, and says why', async () => {
    const { form, user } = await askToSave({
      wrap: (dataSource) => ({
        ...dataSource,
        createVersion: async () => {
          throw unavailable()
        },
      }),
    })

    await user.type(within(form).getByRole('textbox', { name: 'Name (optional)' }), 'Draft')
    await user.click(within(form).getByRole('button', { name: 'Save version' }))

    expect(await within(form).findByRole('alert')).toHaveTextContent('Draftroom is unavailable right now')
    expect(within(form).getByRole('textbox', { name: 'Name (optional)' })).toHaveValue('Draft')
  })

  it('starts empty the next time, whatever was typed and not saved', async () => {
    const { form, user } = await askToSave()
    await user.type(within(form).getByRole('textbox', { name: 'Name (optional)' }), 'Never saved')
    await user.click(within(form).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(saveButton())

    expect(within(await screen.findByRole('dialog')).getByRole('textbox', { name: 'Name (optional)' })).toHaveValue('')
  })
})
