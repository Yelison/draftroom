import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { answer, main, openShared, renderScreen, titlesIn } from './testing/openShared.tsx'

const heading = () => screen.findByRole('heading', { level: 1, name: 'Shared' })
const section = (name: RegExp | string) => within(main()).getByRole('region', { name })

describe('the Shared screen', () => {
  it('has a block for each permission the person has, in the order edit, comment, view, and says what they can do', async () => {
    await openShared()

    const blocks = within(main()).getAllByRole('region')
    expect(blocks.map((block) => within(block).getByRole('heading', { level: 2 }).textContent)).toEqual([
      'You can edit',
      'You can comment',
      'You can view',
    ])
    expect(within(blocks[0]!).getByText('You can change the text and add comments.')).toBeInTheDocument()
    expect(
      within(blocks[1]!).getByText('You can read the text and add comments, but not change it.'),
    ).toBeInTheDocument()
    expect(within(blocks[2]!).getByText('You can read it, but not change it or comment on it.')).toBeInTheDocument()
  })

  it('puts each document in the block of its permission, with the order of the list inside it', async () => {
    await openShared()

    expect(titlesIn(section(/^You can edit/))).toEqual(['Autumn launch plan', 'Weekly update — October 6'])
    expect(titlesIn(section(/^You can view/))).toContain('Presupuesto 2027')
    expect(within(main()).queryByText('Old pricing draft')).not.toBeInTheDocument()
  })

  it('says how many documents a block has in its name, which a screen reader reads', async () => {
    await openShared()

    expect(section('You can edit 2 documents')).toBeInTheDocument()
  })

  it('shows what a row knows: who created the document and when it changed, and the start of its text', async () => {
    await openShared()

    const row = within(section(/^You can edit/))
      .getByRole('link', { name: 'Autumn launch plan' })
      .closest('li')!
    expect(within(row).getByText('Created by')).toBeInTheDocument()
    expect(within(row).getByText('Marta Ruiz')).toBeInTheDocument()
    expect(within(row).getByText('Updated')).toBeInTheDocument()
    expect(within(row).getByText(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/)).toBeInTheDocument()
    expect(within(row).getByText(/^The launch moves to the second week/)).toBeInTheDocument()
  })

  it('says "No text yet" for a document with no text', async () => {
    await openShared('/shared', {
      wrap: (dataSource) => ({
        ...dataSource,
        listSharedDocuments: async (request) => {
          const list = await dataSource.listSharedDocuments(request)
          return { items: list.items.map((document) => ({ ...document, excerpt: null })) }
        },
      }),
    })

    expect(within(main()).getAllByText('No text yet')).toHaveLength(6)
  })

  it('draws only the blocks that have documents', async () => {
    await openShared('/shared', {
      wrap: (dataSource) => ({
        ...dataSource,
        listSharedDocuments: async (request) => {
          const list = await dataSource.listSharedDocuments(request)
          return { items: list.items.filter((document) => document.role === 'viewer') }
        },
      }),
    })

    expect(within(main()).getAllByRole('region')).toHaveLength(1)
    expect(within(main()).queryByRole('heading', { name: /^You can edit/ })).not.toBeInTheDocument()
  })

  it('asks the server once, for the whole list, and not for each permission', async () => {
    const asked: unknown[] = []
    await openShared('/shared', {
      wrap: (dataSource) => ({
        ...dataSource,
        listSharedDocuments: (request) => {
          asked.push(request?.params?.query)
          return dataSource.listSharedDocuments(request)
        },
      }),
    })

    expect(asked).toEqual([undefined])
  })

  it('writes the words and the dates in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/shared', { signedInAs: 'daniel@harborpine.example' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Compartidos' })).toBeInTheDocument()
    const edit = await within(main()).findByRole('region', { name: 'Puedes editar 2 documentos' })
    expect(within(edit).getByText('Puedes cambiar el texto y añadir comentarios.')).toBeInTheDocument()
    expect(within(edit).getAllByText('Creado por')).toHaveLength(2)
    expect(within(edit).getAllByText('Actualizado')).toHaveLength(2)
  })
})

describe('opening a shared document', () => {
  it('is one link for each row, whose name is the title, and there is no "Open" button', async () => {
    await openShared()

    const links = within(main()).getAllByRole('link')
    expect(links).toHaveLength(6)
    expect(within(main()).queryByRole('button')).not.toBeInTheDocument()
    expect(within(main()).queryByRole('link', { name: /^Open/ })).not.toBeInTheDocument()
    expect(within(main()).getByRole('link', { name: 'Autumn launch plan' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/documents\//),
    )
  })

  it('happens with a click on the row', async () => {
    const { router, user } = await openShared()

    await user.click(within(main()).getByRole('link', { name: 'Autumn launch plan' }))

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/documents\/.+/))
  })

  it('happens with the keyboard: Tab goes from row to row and Enter opens the one with the focus', async () => {
    const { router, user } = await openShared()
    const links = within(main()).getAllByRole('link')

    await user.click(within(main()).getByRole('heading', { level: 1 }))
    await user.tab()
    expect(links[0]).toHaveFocus()
    await user.tab()
    expect(links[1]).toHaveFocus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/documents\/.+/))
  })
})

describe('the states of the Shared screen', () => {
  it('shows a skeleton with a spoken status while the list is on its way, under the headline the page already has', async () => {
    renderScreen('/shared', {
      signedInAs: 'daniel@harborpine.example',
      wrap: (dataSource) => ({ ...dataSource, listSharedDocuments: () => new Promise(() => undefined) }),
    })

    await heading()
    const status = await within(main()).findByText('Loading shared documents')
    expect(status).toHaveAttribute('role', 'status')
    expect(status.closest('[aria-busy="true"]')).not.toBeNull()
    expect(within(main()).queryByRole('region')).not.toBeInTheDocument()
  })

  it('says in one sentence that nothing has been shared when the list is empty', async () => {
    renderScreen('/shared', { signedInAs: 'marta@harborpine.example' })

    expect(await within(main()).findByText('Nobody has shared a document with you yet.')).toBeInTheDocument()
    expect(within(main()).queryByRole('region')).not.toBeInTheDocument()
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

    expect(await within(main()).findAllByRole('region')).toHaveLength(3)
    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
  })
})
