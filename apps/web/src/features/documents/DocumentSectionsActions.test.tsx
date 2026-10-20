import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../data/errors.ts'
import { daniel } from '../../data/mock/fixtures/index.ts'
import { keysAfterMutation } from '../../data/queryKeys.ts'
import { fixtures, renderScreen, workspaceFixtures } from './testing/renderScreen.tsx'

const { launchPlan, weeklyEnglish, brandVoice, interviews, designReview, budget } = fixtures
const workspaceId = workspaceFixtures.harborPine.id
const main = () => screen.getByRole('main')
const section = (name: string) => within(main()).findByRole('region', { name })
const pinOf = async (title: string) => within(main()).findByRole('button', { name: `Pin ${title}` })
const linkOf = (title: string) => within(main()).getByRole('link', { name: title })

describe('pinning a document from a section', () => {
  it('moves it to "Pinned" and out of its section, and leaves the focus on the document that took its place', async () => {
    const { user } = renderScreen('/documents')
    const weekly = await pinOf(weeklyEnglish.title)

    weekly.focus()
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Pinned' })).getByRole('link', { name: weeklyEnglish.title }),
      ).toBeInTheDocument(),
    )
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'No folder' })).queryByRole('link', { name: weeklyEnglish.title }),
      ).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(linkOf(brandVoice.title)).toHaveFocus())
  })

  it('marks stale exactly what the table of the contract says', async () => {
    const { user, invalidatedKeys } = renderScreen('/documents')

    await user.click(await pinOf(weeklyEnglish.title))

    await waitFor(() =>
      expect(invalidatedKeys()).toEqual(
        keysAfterMutation('pinDocument', { workspaceId, documentId: weeklyEnglish.id }),
      ),
    )
  })

  it('is offered to a person who can only read the document, because a pin is personal', async () => {
    const { user } = renderScreen('/documents', { signedInAs: daniel.email })

    await user.click(await pinOf(budget.title))

    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Pinned' })).getByRole('link', { name: budget.title }),
      ).toBeInTheDocument(),
    )
  })

  it('says it could not pin, and leaves the document where it was', async () => {
    const { user } = renderScreen('/documents', {
      wrap: (dataSource) => ({
        ...dataSource,
        pinDocument: () =>
          Promise.reject(new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })),
      }),
    })
    const button = await pinOf(weeklyEnglish.title)

    await user.click(button)

    expect(await within(main()).findByRole('alert')).toHaveTextContent('Draftroom is unavailable right now')
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveFocus()
  })
})

describe('taking a pin off', () => {
  it('moves the document back to its folder, and the focus goes to the next pinned document', async () => {
    const { user } = renderScreen('/documents')

    await user.click(await pinOf(launchPlan.title))

    const product = await section('Product')
    await waitFor(() => expect(within(product).getByRole('link', { name: launchPlan.title })).toBeInTheDocument())
    await waitFor(() => expect(linkOf(interviews.title)).toHaveFocus())
    expect(within(await section('Pinned')).queryByRole('link', { name: launchPlan.title })).not.toBeInTheDocument()
  })

  it('draws "Pinned" no more when the last pin is gone, and the focus is not lost', async () => {
    const { user } = renderScreen('/documents')
    await user.click(await pinOf(launchPlan.title))
    await waitFor(() => expect(linkOf(interviews.title)).toHaveFocus())

    await user.click(await pinOf(interviews.title))

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Pinned' })).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1, name: 'Documents' })).toHaveFocus()
  })
})

describe('moving and archiving from a section', () => {
  it('moves a document to the section of its new folder, and the focus goes to the next document', async () => {
    const { user } = renderScreen('/documents')
    await user.click(await within(main()).findByRole('button', { name: `Actions for ${weeklyEnglish.title}` }))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename or move' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename or move' })

    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Folder' }), 'Research')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Research' })).getByRole('link', { name: weeklyEnglish.title }),
      ).toBeInTheDocument(),
    )
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'No folder' })).queryByRole('link', { name: weeklyEnglish.title }),
      ).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(linkOf(brandVoice.title)).toHaveFocus())
  })

  it('takes an archived document out of its section, and the focus goes to the heading when none is left', async () => {
    const { user } = renderScreen('/documents')
    await user.click(await within(main()).findByRole('button', { name: `Actions for ${designReview.title}` }))
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }))
    const confirmation = await screen.findByRole('dialog', { name: `Archive “${designReview.title}”?` })

    await user.click(within(confirmation).getByRole('button', { name: 'Archive' }))

    await waitFor(() => expect(screen.queryByRole('link', { name: designReview.title })).not.toBeInTheDocument())
    await waitFor(() => expect(within(main()).getByRole('button', { name: 'Product' })).toHaveFocus())
  })
})

describe('the menu of a folder section', () => {
  it('leads to the page of the folder, which lists all of it', async () => {
    const { user, router } = renderScreen('/documents')

    await user.click(await within(main()).findByRole('button', { name: 'Actions for Product' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Open folder' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/folders/${workspaceFixtures.productFolder.id}`))
    expect(await screen.findByRole('heading', { level: 1, name: 'Product' })).toBeInTheDocument()
  })
})
