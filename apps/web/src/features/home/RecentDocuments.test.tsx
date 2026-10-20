import { within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { daniel } from '../../data/mock/fixtures/index.ts'
import { fixtures } from '../documents/testing/renderScreen.tsx'
import { failingOnce, main, never, overriding, renderHome } from './testing/homeData.ts'

const { launchPlan, designReview, weeklyEnglish, weeklySpanish } = fixtures
const recent = () => within(main()).getByRole('region', { name: 'Pick up where you left off' })
const cardOf = (title: string) => within(recent()).getByRole('link', { name: title }).closest('li') as HTMLElement

describe('the documents to pick up on Home', () => {
  it('shows the three changed most recently, newest first, from the first page of the list', async () => {
    const limits: unknown[] = []
    await renderHome({
      wrap: (dataSource) =>
        overriding({
          listDocuments: (request) => {
            limits.push(request.params.query?.limit)
            return dataSource.listDocuments(request)
          },
        })(dataSource),
    })

    await within(recent()).findByRole('link', { name: launchPlan.title })
    const cards = within(recent()).getAllByRole('listitem')
    expect(cards.map((card) => within(card).getByRole('link').textContent)).toEqual([
      launchPlan.title,
      designReview.title,
      // Changed at the same instant as its English twin: the list keeps those with the larger id first.
      weeklySpanish.title,
    ])
    expect(limits).toContain(3)
    expect(within(recent()).queryByRole('link', { name: weeklyEnglish.title })).not.toBeInTheDocument()
  })

  it('says what each document says, where it is and when it changed', async () => {
    await renderHome()
    await within(recent()).findByRole('link', { name: launchPlan.title })

    const card = cardOf(launchPlan.title)
    expect(card).toHaveTextContent(launchPlan.excerpt ?? '')
    expect(card).toHaveTextContent('Product')
    const updated = within(card).getByText((_, element) => element?.tagName === 'TIME')
    expect(updated).toHaveAttribute('datetime', launchPlan.updatedAt)
    expect(card).toHaveTextContent(/Updated .*2026/)
  })

  it('says "No folder" for a document that is in none, and "No text yet" for one that is empty', async () => {
    await renderHome({
      wrap: (dataSource) =>
        overriding({
          listDocuments: async (request) => {
            const page = await dataSource.listDocuments(request)
            return { ...page, items: page.items.map((item) => ({ ...item, folderId: null, excerpt: null })) }
          },
        })(dataSource),
    })
    await within(recent()).findByRole('link', { name: launchPlan.title })

    const card = cardOf(launchPlan.title)
    expect(card).toHaveTextContent('No folder')
    expect(card).toHaveTextContent('No text yet')
  })

  it('puts no role badge on the documents of their owner', async () => {
    await renderHome()
    await within(recent()).findByRole('link', { name: launchPlan.title })

    expect(recent().querySelector('[data-role]')).toBeNull()
  })

  it('puts the role badge on a document somebody else owns, and only on those', async () => {
    await renderHome({ signedInAs: daniel.email })
    await within(recent()).findByRole('link', { name: launchPlan.title })

    expect(within(cardOf(launchPlan.title)).getByText('Editor')).toHaveAttribute('data-role', 'editor')
    // Daniel made this one himself.
    expect(cardOf(designReview.title).querySelector('[data-role]')).toBeNull()
  })

  it('is one link per card, named by the title and described by what the card says', async () => {
    await renderHome()
    await within(recent()).findByRole('link', { name: launchPlan.title })

    const card = cardOf(launchPlan.title)
    const links = within(card).getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', `/documents/${launchPlan.id}`)
    expect(links[0]).toHaveAccessibleDescription(expect.stringContaining(launchPlan.excerpt ?? ''))
  })

  it('shows a short sentence, and no cards, when the person has no documents', async () => {
    await renderHome({ wrap: overriding({ listDocuments: async () => ({ items: [], nextCursor: null }) }) })

    expect(await within(recent()).findByText(/documents you create/i)).toBeInTheDocument()
    expect(within(recent()).queryByRole('listitem')).not.toBeInTheDocument()
  })

  it.each(['listDocuments', 'listFolders'] as const)(
    'says it could not read them when %s fails, and tries again when asked',
    async (operation) => {
      const { user } = await renderHome({ wrap: failingOnce(operation) })

      expect(await within(recent()).findByRole('alert')).toHaveTextContent("We couldn't load your recent documents")
      await user.click(within(recent()).getByRole('button', { name: 'Try again' }))

      expect(await within(recent()).findByRole('link', { name: launchPlan.title })).toBeInTheDocument()
      expect(within(recent()).queryByRole('alert')).not.toBeInTheDocument()
    },
  )

  it('shows a skeleton with a spoken status while they are on their way', async () => {
    await renderHome({ wrap: overriding({ listDocuments: never }) })

    expect(await within(main()).findByText('Loading your recent documents')).toHaveAttribute('role', 'status')
  })
})
