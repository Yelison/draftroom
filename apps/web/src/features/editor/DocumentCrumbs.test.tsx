import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { ApiError } from '../../data/errors.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { launchPlan, renderEditor } from './testing/renderEditor.tsx'

const crumbs = () => screen.findByRole('navigation', { name: /Where the document is|Dónde está el documento/ })

describe('where the document is, in the band', () => {
  it('names the folder, which leads to its own page, and the title, which is the page the person is on', async () => {
    renderEditor()

    const nav = await crumbs()

    const folder = await within(nav).findByRole('link', { name: 'Product' })
    expect(folder).toHaveAttribute('href', `/folders/${launchPlan.folderId}`)
    expect(within(nav).getByText('Autumn launch plan').closest('li')).toHaveAttribute('aria-current', 'page')
  })

  it('says "No folder" for a document that is in none, and leads to Documents', async () => {
    renderEditor({
      wrap: (dataSource: DataSource): DataSource => ({
        ...dataSource,
        getDocument: async (request) => ({ ...(await dataSource.getDocument(request)), folderId: null }),
      }),
    })

    const nav = await crumbs()

    expect(await within(nav).findByRole('link', { name: 'No folder' })).toHaveAttribute('href', '/documents')
  })

  it('keeps the place of the folder until the folders arrive, so the title does not move', async () => {
    renderEditor({
      wrap: (dataSource: DataSource): DataSource => ({
        ...dataSource,
        listFolders: () => new Promise(() => {}),
      }),
    })

    const nav = await crumbs()

    expect(within(nav).queryByRole('link')).not.toBeInTheDocument()
    expect(nav.querySelectorAll('li')).toHaveLength(2)
  })

  it('leaves the title alone when the folders could not be read', async () => {
    renderEditor({
      wrap: (dataSource: DataSource): DataSource => ({
        ...dataSource,
        listFolders: async () => {
          throw new ApiError({ type: 'about:blank', title: 'x', status: 500, code: 'internal-error' })
        },
      }),
    })

    const nav = await crumbs()

    await waitFor(() => expect(nav.querySelectorAll('li')).toHaveLength(1))
    expect(within(nav).getByText('Autumn launch plan')).toBeInTheDocument()
  })

  it('is written in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderEditor()

    expect(await screen.findByRole('navigation', { name: 'Dónde está el documento' })).toBeInTheDocument()
    localStorage.removeItem(localeStorageKey)
  })
})
