import { waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { fixtures, renderScreen } from '../documents/testing/renderScreen.tsx'
import { failingOnce, main, manyPinned, never, overriding, renderHome } from './testing/homeData.ts'

const { launchPlan, interviews } = fixtures
const pinned = () => within(main()).getByRole('region', { name: 'Pinned' })
const titles = () =>
  within(pinned())
    .getAllByRole('link')
    .map((link) => link.textContent)

describe('the pinned documents of Home', () => {
  it('lists what the person pinned as chips with a star, in the order the list gives', async () => {
    await renderHome()

    await within(main()).findByRole('region', { name: 'Pinned' })
    expect(titles()).toEqual([launchPlan.title, interviews.title])
    expect(within(pinned()).queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens a document from its chip', async () => {
    const { user, router } = await renderHome()

    await user.click(await within(main()).findByRole('link', { name: interviews.title }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/documents/${interviews.id}`))
  })

  it('draws no section for a person with nothing pinned', async () => {
    await renderHome({ wrap: overriding({ listPinnedDocuments: async () => ({ items: [] }) }) })
    await within(main()).findByRole('link', { name: 'See all activity' })

    expect(within(main()).queryByRole('region', { name: 'Pinned' })).not.toBeInTheDocument()
    expect(within(main()).queryByText('Pinned')).not.toBeInTheDocument()
  })

  it('shows every chip, and no button, up to the two rows the grid has room for', async () => {
    await renderHome({ wrap: manyPinned(8) })

    await within(main()).findByRole('region', { name: 'Pinned' })
    expect(titles()).toHaveLength(8)
    expect(within(pinned()).queryByRole('button')).not.toBeInTheDocument()
  })

  it('folds what does not fit in two rows behind a button that says exactly how many there are', async () => {
    await renderHome({ wrap: manyPinned(32) })

    const button = await within(main()).findByRole('button', { name: 'Show all 32 pinned' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(titles()).toHaveLength(8)
    expect(titles()[0]).toBe('Pinned 1')
  })

  it('unfolds the rest where it is, puts the focus on the first chip that appears, and folds it again', async () => {
    const { user } = await renderHome({ wrap: manyPinned(12) })

    await user.click(await within(main()).findByRole('button', { name: 'Show all 12 pinned' }))

    const fewer = within(pinned()).getByRole('button', { name: 'Show fewer' })
    expect(fewer).toHaveAttribute('aria-expanded', 'true')
    expect(titles()).toHaveLength(12)
    expect(within(pinned()).getByRole('link', { name: 'Pinned 9' })).toHaveFocus()

    await user.click(fewer)

    expect(titles()).toHaveLength(8)
    expect(within(pinned()).getByRole('button', { name: 'Show all 12 pinned' })).toHaveFocus()
  })

  it('is operated with the keyboard alone', async () => {
    const { user } = await renderHome({ wrap: manyPinned(12) })
    const button = await within(main()).findByRole('button', { name: 'Show all 12 pinned' })

    button.focus()
    await user.keyboard('{Enter}')

    expect(within(pinned()).getByRole('link', { name: 'Pinned 9' })).toHaveFocus()
  })

  it('counts in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/', { wrap: manyPinned(12) })

    expect(await within(main()).findByRole('button', { name: 'Ver los 12 fijados' })).toBeInTheDocument()
  })

  it('shows a skeleton with a spoken status while they are on their way', async () => {
    renderScreen('/', { wrap: overriding({ listPinnedDocuments: never }) })

    expect(await within(main()).findByText('Loading your pinned documents')).toHaveAttribute('role', 'status')
  })

  it('says it could not read them, and tries again when asked', async () => {
    const { user } = await renderHome({ wrap: failingOnce('listPinnedDocuments') })

    const section = await within(main()).findByRole('region', { name: 'Pinned' })
    expect(await within(section).findByRole('alert')).toHaveTextContent("We couldn't load your pinned documents")
    await user.click(within(section).getByRole('button', { name: 'Try again' }))

    expect(await within(section).findByRole('link', { name: launchPlan.title })).toBeInTheDocument()
    expect(within(section).queryByRole('alert')).not.toBeInTheDocument()
  })
})
