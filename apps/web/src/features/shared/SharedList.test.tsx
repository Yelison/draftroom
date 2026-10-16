import type { Schema } from '@draftroom/contract'
import { waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { filters, main, openShared, titles } from './testing/openShared.tsx'

const preview = () => within(main()).getByRole('complementary', { name: /^Preview of/ })

describe('the preview of a shared document', () => {
  it('opens beside the table with what the list knows, and puts the choice in the address', async () => {
    const { router, user } = await openShared()

    await user.click(within(main()).getByRole('button', { name: 'Autumn launch plan' }))

    const aside = within(main()).getByRole('complementary', { name: 'Preview of “Autumn launch plan”' })
    expect(within(aside).getByRole('heading', { level: 2, name: 'Autumn launch plan' })).toBeInTheDocument()
    expect(within(aside).getByText('Editor')).toBeInTheDocument()
    expect(within(aside).getByText('Created by Marta Ruiz')).toBeInTheDocument()
    expect(within(aside).getByRole('link', { name: 'Open document' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/documents\//),
    )
    expect(within(main()).getByRole('button', { name: 'Autumn launch plan' })).toHaveAttribute('aria-pressed', 'true')
    expect(router.state.location.search).toMatch(/^\?selected=/)
  })

  it('opens from the address, so a link to it shows the same', async () => {
    const first = await openShared()
    await first.user.click(within(main()).getByRole('button', { name: 'Presupuesto 2027' }))
    const search = first.router.state.location.search
    first.unmount()

    await openShared(`/shared${search}`)

    expect(preview()).toHaveAccessibleName('Preview of “Presupuesto 2027”')
  })

  it('shows nothing for a document that is not in the list, instead of a preview of something else', async () => {
    await openShared('/shared?selected=not-in-the-list')

    expect(within(main()).queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('closes with its button and gives the focus back to the row that opened it', async () => {
    const { router, user } = await openShared()
    await user.click(within(main()).getByRole('button', { name: 'Autumn launch plan' }))

    await user.click(within(preview()).getByRole('button', { name: 'Close preview' }))

    expect(within(main()).queryByRole('complementary')).not.toBeInTheDocument()
    expect(within(main()).getByRole('button', { name: 'Autumn launch plan' })).toHaveFocus()
    expect(router.state.location.search).toBe('')
  })

  it('closes when the same row is chosen again', async () => {
    const { user } = await openShared()
    const row = within(main()).getByRole('button', { name: 'Autumn launch plan' })

    await user.click(row)
    await user.click(row)

    expect(within(main()).queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('says the document is empty when there is no text to show', async () => {
    const { user } = await openShared('/shared', {
      wrap: (dataSource) => ({
        ...dataSource,
        listSharedDocuments: async (request) => {
          const list = await dataSource.listSharedDocuments(request)
          return { items: list.items.map((document) => ({ ...document, excerpt: null })) }
        },
      }),
    })

    await user.click(within(main()).getByRole('button', { name: 'Autumn launch plan' }))

    expect(within(preview()).getByText('This document is empty.')).toBeInTheDocument()
  })

  it('is dropped, with the selection, when another filter is chosen', async () => {
    const { router, user } = await openShared()
    await user.click(within(main()).getByRole('button', { name: 'Presupuesto 2027' }))

    await user.click(within(filters()).getByRole('button', { name: 'Can edit' }))

    await waitFor(() => expect(within(main()).queryByRole('complementary')).not.toBeInTheDocument())
    expect(router.state.location.search).toBe('?access=edit')
  })
})

/** Thirty documents, so that the table has more than a page. The contract gives this list no cursor. */
const thirty = (dataSource: DataSource): DataSource => ({
  ...dataSource,
  listSharedDocuments: async (request) => {
    const [first] = (await dataSource.listSharedDocuments(request)).items
    if (first === undefined) throw new Error('The mock has nothing shared with Daniel')
    const items: Schema<'Document'>[] = Array.from({ length: 30 }, (_, index) => ({
      ...first,
      id: `${index.toString().padStart(8, '0')}-0000-4000-8000-000000000000`,
      title: `Shared document ${index + 1}`,
    }))
    return { items }
  },
})

describe('the pages of the shared table', () => {
  it('shows a page of 25 and the rest after "Load more"', async () => {
    const { user } = await openShared('/shared', { wrap: thirty })

    expect(titles()).toHaveLength(25)
    expect(within(main()).getByText('30 documents')).toBeInTheDocument()
    await user.click(within(main()).getByRole('button', { name: 'Load more' }))

    expect(titles()).toHaveLength(30)
    expect(within(main()).queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('moves the focus to the first document the page brought, so it is not lost with the button', async () => {
    const { user } = await openShared('/shared', { wrap: thirty })

    await user.click(within(main()).getByRole('button', { name: 'Load more' }))

    expect(within(main()).getByRole('button', { name: 'Shared document 26' })).toHaveFocus()
  })

  it('offers no "Load more" when everything fits in a page', async () => {
    await openShared()

    expect(within(main()).queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })
})

describe('the count of the shared table', () => {
  it('is announced again when another filter gives the same number', async () => {
    const { user } = await openShared('/shared', {
      wrap: (dataSource) => ({
        ...dataSource,
        listSharedDocuments: async (request) => {
          const list = await dataSource.listSharedDocuments(request)
          return { items: list.items.slice(0, 2) }
        },
      }),
    })
    const count = () => within(main()).getByText('2 documents')

    const press = (name: string) => user.click(within(filters()).getByRole('button', { name }))
    // Both lists are in the cache after the first visit, so going back to one of them has no loading in between.
    await press('Can edit')
    await waitFor(() => expect(count()).toBeInTheDocument())
    await press('Can view')
    await waitFor(() => expect(count()).toBeInTheDocument())
    await press('Can edit')
    const first = count()

    await press('Can view')

    // Two filters, two answers: the screen reader says the number after each press, though the number did not change.
    expect(count()).not.toBe(first)
  })
})

describe('a selected document beyond the first page', () => {
  it('opens its preview and shows the rows up to it, instead of ignoring the address', async () => {
    const last = `${(29).toString().padStart(8, '0')}-0000-4000-8000-000000000000`
    await openShared(`/shared?selected=${last}`, { wrap: thirty })

    expect(preview()).toHaveAccessibleName('Preview of “Shared document 30”')
    expect(titles()).toHaveLength(30)
    expect(within(main()).queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('keeps the page of 25 when the selected document is on it', async () => {
    const early = `${(2).toString().padStart(8, '0')}-0000-4000-8000-000000000000`
    await openShared(`/shared?selected=${early}`, { wrap: thirty })

    expect(preview()).toHaveAccessibleName('Preview of “Shared document 3”')
    expect(titles()).toHaveLength(25)
  })
})
