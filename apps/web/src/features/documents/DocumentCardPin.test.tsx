import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../data/errors.ts'
import { daniel } from '../../data/mock/fixtures/index.ts'
import { keysAfterMutation } from '../../data/queryKeys.ts'
import { fixtures, renderScreen, workspaceFixtures } from './testing/renderScreen.tsx'

const { launchPlan, weeklyEnglish, designReview } = fixtures
const workspaceId = workspaceFixtures.harborPine.id
const main = () => screen.getByRole('main')
const pinOf = (title: string) => within(main()).findByRole('button', { name: `Pin ${title}` })

describe('pinning a document from its card', () => {
  it('shows which documents are pinned, and pins one for the person with the keyboard', async () => {
    const { user } = renderScreen('/documents')
    expect(await pinOf(launchPlan.title)).toHaveAttribute('aria-pressed', 'true')
    const weekly = await pinOf(weeklyEnglish.title)
    expect(weekly).toHaveAttribute('aria-pressed', 'false')

    weekly.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(weekly).toHaveAttribute('aria-pressed', 'true'))
    expect(weekly).toHaveFocus()
  })

  it('takes the pin off a document that is pinned', async () => {
    const { user } = renderScreen('/documents')

    await user.click(await pinOf(launchPlan.title))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: `Pin ${launchPlan.title}` })).toHaveAttribute('aria-pressed', 'false'),
    )
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
    const button = await pinOf(designReview.title)

    await user.click(button)

    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'))
  })

  it('says it could not pin, and leaves the card as it was', async () => {
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
  })
})
