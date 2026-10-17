import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import {
  conflict,
  daniel,
  launchPlan,
  openVersions,
  rows,
  sofia,
  unavailable,
  versionRows,
} from './testing/openVersions.tsx'

const restoreButtonOf = (row: HTMLElement) => within(row).getByRole('button', { name: /^Restore “/ })
const dialog = () => screen.findByRole('dialog')

/** Opens the confirmation for the version that has a name of its own, as its owner does. */
async function askToRestore(wrap?: (dataSource: DataSource) => DataSource) {
  const view = await openVersions(launchPlan.id, wrap === undefined ? {} : { wrap })
  const trigger = restoreButtonOf(rows()[1]!)
  await view.user.click(trigger)
  return { ...view, trigger, confirmation: await dialog() }
}

/** A restore that waits for the test to let it go, and then answers as the mock does. */
function slowRestore() {
  let release = () => {}
  const waiting = new Promise<void>((resolve) => (release = resolve))
  const wrap = (dataSource: DataSource): DataSource => ({
    ...dataSource,
    restoreVersion: async (request) => {
      await waiting
      return dataSource.restoreVersion(request)
    },
  })
  return { wrap, release }
}

describe('who is offered the restore', () => {
  it('is an owner, on every version of the list', async () => {
    await openVersions()

    expect(screen.getAllByRole('button', { name: /^Restore “/ })).toHaveLength(3)
  })

  it.each([
    { role: 'an editor', email: daniel.email },
    { role: 'a commenter', email: sofia },
  ])('is not $role: the action is not on the screen', async ({ email }) => {
    await openVersions(launchPlan.id, { signedInAs: email })

    expect(rows()).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /Restore/ })).not.toBeInTheDocument()
  })
})

describe('the confirmation to restore', () => {
  it('names the version and says what is kept and what may not be, without promising that nothing is lost', async () => {
    const { confirmation } = await askToRestore()

    expect(within(confirmation).getByRole('heading', { name: 'Restore “Before the pricing review”?' })).toBeVisible()
    expect(confirmation).toHaveTextContent('How it is now is saved first as a version')
    expect(confirmation).toHaveTextContent('may not be kept')
  })

  // A browser puts the focus on the first control of a modal dialog (the end-to-end spec checks it there; jsdom does not):
  // what is pinned here is that this is the way out and not the button that restores, so Enter cannot restore by accident.
  it('puts the way out before the button that restores', async () => {
    const { confirmation } = await askToRestore()

    const [first, second] = within(confirmation).getAllByRole('button')
    expect(first).toHaveAccessibleName('Close')
    expect(second).toHaveAccessibleName('Restore')
  })

  it('gives the focus back to the button that opened it when it is cancelled', async () => {
    const { trigger, confirmation, user } = await askToRestore()

    await user.click(within(confirmation).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('gives the focus back to the button that opened it when Escape closes it', async () => {
    const { trigger, confirmation } = await askToRestore()

    fireEvent(confirmation, new Event('cancel', { cancelable: true }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })
})

describe('restoring a version', () => {
  it('shows that it is under way, and cannot be closed until it is done', async () => {
    const { wrap, release } = slowRestore()
    const { confirmation, user } = await askToRestore(wrap)

    await user.click(within(confirmation).getByRole('button', { name: 'Restore' }))

    expect(await within(confirmation).findByText('Restoring the version')).toBeInTheDocument()
    expect(within(confirmation).getByRole('button', { name: 'Close' })).toBeDisabled()
    fireEvent(confirmation, new Event('cancel', { cancelable: true }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => release())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('goes back to the button that asked, announces it, and shows the versions the restore made', async () => {
    const { trigger, confirmation, user, invalidatedKeys } = await askToRestore()

    await user.click(within(confirmation).getByRole('button', { name: 'Restore' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(trigger).toBeInTheDocument()
    expect(await screen.findByText(/The document went back to “Before the pricing review”/)).toBeInTheDocument()
    // The restore saved how the document was, then the restored state: both are the newest rows.
    await waitFor(() => expect(rows()).toHaveLength(5))
    expect(rows()[0]).toHaveTextContent('Restored version')
    expect(rows()[1]).toHaveTextContent('Version before a restore')
    expect(invalidatedKeys()).toContainEqual(['documents', launchPlan.id, 'versions'])
  })

  it('keeps the dialog open and says why when the server could not do it, and works when asked again', async () => {
    let failing = true
    const { confirmation, user } = await askToRestore((dataSource) => ({
      ...dataSource,
      restoreVersion: async (request) => {
        if (failing) throw unavailable()
        return dataSource.restoreVersion(request)
      },
    }))
    const confirm = () => within(confirmation).getByRole('button', { name: 'Restore' })

    await user.click(confirm())

    expect(await within(confirmation).findByRole('alert')).toHaveTextContent('Draftroom is unavailable right now')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    failing = false
    await user.click(confirm())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('says that nothing was restored when people kept editing (409), and what to do', async () => {
    const { confirmation, user } = await askToRestore((dataSource) => ({
      ...dataSource,
      restoreVersion: async () => {
        throw conflict()
      },
    }))

    await user.click(within(confirmation).getByRole('button', { name: 'Restore' }))

    expect(await within(confirmation).findByRole('alert')).toHaveTextContent(
      'People are editing the document right now, so nothing was restored. Try again in a moment.',
    )
    // Not the generic message: the owner knows what happened and that asking again is the way.
    expect(within(confirmation).queryByText('Something went wrong. Try again.')).not.toBeInTheDocument()
    expect(await versionRows()).toHaveLength(3)
  })

  it('names a version that has no name of its own by what it is and when it was made', async () => {
    await openVersions()

    expect(restoreButtonOf(rows()[0]!)).toHaveAccessibleName(/^Restore “Automatic version from Oct 13, 2026/)
  })
})
