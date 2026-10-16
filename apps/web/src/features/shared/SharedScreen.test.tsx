import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { answer, filters, main, openShared, renderScreen, titles } from './testing/openShared.tsx'

const heading = () => screen.findByRole('heading', { level: 1, name: 'Shared' })

describe('the Shared screen', () => {
  it('lists what others shared with the person, each with its creator and the permission the person has', async () => {
    await openShared()

    const row = within(main()).getByRole('row', { name: /Autumn launch plan/ })
    expect(within(row).getByText('Marta Ruiz')).toBeInTheDocument()
    expect(within(row).getByText('Editor')).toBeInTheDocument()
    expect(within(main()).getByRole('row', { name: /Presupuesto 2027/ })).toHaveTextContent('Viewer')
    expect(within(main()).queryByRole('row', { name: /Old pricing draft/ })).not.toBeInTheDocument()
  })

  it('says how many documents the list has, in a region that was in the page before the list', async () => {
    await openShared()

    expect(within(main()).getByText('6 documents')).toHaveAttribute('role', 'status')
  })

  it('writes the words and the dates in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/shared', { signedInAs: 'daniel@harborpine.example' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Compartidos' })).toBeInTheDocument()
    const row = await within(main()).findByRole('row', { name: /Autumn launch plan/ })
    expect(within(row).getByText('Editor')).toBeInTheDocument()
    expect(within(main()).getByRole('group', { name: 'Filtrar por permiso' })).toBeInTheDocument()
    expect(within(main()).getByText('6 documentos')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Abrir «Autumn launch plan»' })).toBeInTheDocument()
  })

  it('opens a document from its row', async () => {
    const { router, user } = await openShared()

    await user.click(within(main()).getByRole('link', { name: 'Open “Autumn launch plan”' }))

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/documents\/.+/))
  })

  it('shows a skeleton with a spoken status while the list is on its way, under the headline the page already has', async () => {
    renderScreen('/shared', {
      signedInAs: 'daniel@harborpine.example',
      wrap: (dataSource) => ({ ...dataSource, listSharedDocuments: () => new Promise(() => undefined) }),
    })

    await heading()
    expect(await within(main()).findByText('Loading shared documents')).toHaveAttribute('role', 'status')
    expect(within(main()).queryByRole('table')).not.toBeInTheDocument()
  })

  it('says nothing has been shared when the list is empty, and offers no way out of a filter that is not there', async () => {
    renderScreen('/shared', { signedInAs: 'marta@harborpine.example' })

    expect(await within(main()).findByText('Nothing has been shared with you yet')).toBeInTheDocument()
    expect(within(main()).queryByRole('button', { name: 'Show all documents' })).not.toBeInTheDocument()
    expect(within(main()).queryByRole('table')).not.toBeInTheDocument()
  })

  it('says it could not read the list, and tries again when asked', async () => {
    let failures = 1
    const { user } = renderScreen('/shared', {
      signedInAs: 'daniel@harborpine.example',
      wrap: (dataSource) => ({
        ...dataSource,
        listSharedDocuments: (request) => {
          if (failures-- > 0) return Promise.reject(answer(503, 'unavailable'))
          return dataSource.listSharedDocuments(request)
        },
      }),
    })

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load your documents")
    await user.click(within(main()).getByRole('button', { name: 'Try again' }))

    expect(await within(main()).findByRole('table')).toBeInTheDocument()
    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('the filters of the Shared screen', () => {
  it('are toggle buttons in a named group, with "All" pressed until one is chosen', async () => {
    await openShared()

    const chips = within(filters()).getAllByRole('button')
    expect(chips.map((chip) => [chip.textContent, chip.getAttribute('aria-pressed')])).toEqual([
      ['All', 'true'],
      ['Can edit', 'false'],
      ['Can comment', 'false'],
      ['Can view', 'false'],
    ])
  })

  it('narrow the list to one permission, keep the filter in the address and leave the focus on the chip', async () => {
    const { router, user } = await openShared()

    await user.click(within(filters()).getByRole('button', { name: 'Can edit' }))

    await waitFor(() => expect(titles()).toEqual(['Autumn launch plan', 'Weekly update — October 6']))
    expect(router.state.location.search).toBe('?access=edit')
    expect(within(filters()).getByRole('button', { name: 'Can edit' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(filters()).getByRole('button', { name: 'Can edit' })).toHaveFocus()
    expect(within(main()).getByText('2 documents')).toBeInTheDocument()
  })

  it('start applied when the address has one', async () => {
    await openShared('/shared?access=view')

    expect(within(filters()).getByRole('button', { name: 'Can view' })).toHaveAttribute('aria-pressed', 'true')
    expect(titles()).toEqual(expect.arrayContaining(['Presupuesto 2027']))
    expect(titles()).not.toContain('Autumn launch plan')
  })

  it('ignore a value the contract does not know instead of asking the server for it', async () => {
    await openShared('/shared?access=admin')

    expect(within(filters()).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(titles()).toHaveLength(6)
  })

  it('ask the server only for the permission chosen', async () => {
    const asked: unknown[] = []
    const { user } = await openShared('/shared', {
      wrap: (dataSource) => ({
        ...dataSource,
        listSharedDocuments: (request) => {
          asked.push(request?.params?.query)
          return dataSource.listSharedDocuments(request)
        },
      }),
    })

    await user.click(within(filters()).getByRole('button', { name: 'Can comment' }))

    await waitFor(() => expect(asked).toEqual([undefined, { access: 'comment' }]))
  })

  it('say when no document has the permission, and "Show all documents" clears the filter and keeps the focus in the filters', async () => {
    const { user } = renderScreen('/shared?access=edit', {
      signedInAs: 'daniel@harborpine.example',
      wrap: (dataSource) => ({
        ...dataSource,
        listSharedDocuments: (request) =>
          request?.params?.query?.access === undefined
            ? dataSource.listSharedDocuments(request)
            : Promise.resolve({ items: [] }),
      }),
    })

    expect(await within(main()).findByText('No documents with this permission')).toBeInTheDocument()
    await user.click(within(main()).getByRole('button', { name: 'Show all documents' }))

    expect(await within(main()).findByRole('table')).toBeInTheDocument()
    expect(within(filters()).getByRole('button', { name: 'All' })).toHaveFocus()
  })
})
