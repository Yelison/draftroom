import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import {
  answer,
  archived,
  findRow,
  fixtures,
  main,
  onePerPage,
  panel,
  queryRow,
  renderScreen,
  row,
  selectedRow,
} from './testing/openTrash.tsx'

const { first, second } = archived
const heading = () => screen.findByRole('heading', { level: 1, name: 'Trash' })

describe('the Trash screen', () => {
  it('lists the archived documents of the workspace, each with the day it was archived and the folder it came from, and none that is live', async () => {
    renderScreen('/trash')
    await heading()
    await findRow(first.title)

    const rows = within(main()).getAllByRole('listitem')
    expect(rows.map((item) => item.textContent)).toEqual([
      `${first.title}Archived Sep 19, 2026 · No folder`,
      `${second.title}Archived Sep 18, 2026 · from Product`,
    ])
    expect(within(main()).queryByText('Autumn launch plan')).not.toBeInTheDocument()
  })

  it('writes the day of each row in a time element, so that it is a date to whatever reads it', async () => {
    renderScreen('/trash')
    await findRow(first.title)

    expect(row(first.title).querySelector('time')).toHaveAttribute('datetime', first.archivedAt)
  })

  it('does not offer to open an archived document: only its owner can read it, and only to restore or delete it', async () => {
    renderScreen('/trash')

    await findRow(first.title)
    expect(within(main()).queryByRole('link')).not.toBeInTheDocument()
  })

  it('writes the dates and the words in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/trash')

    expect(await screen.findByRole('heading', { level: 1, name: 'Papelera' })).toBeInTheDocument()
    expect(await findRow(second.title)).toHaveTextContent('Archivado el 18 sept 2026 · de Product')
    const detail = within(main()).getByRole('region', { name: first.title })
    expect(within(detail).getByText('Sin carpeta')).toBeInTheDocument()
    expect(within(detail).getByText('Al restaurarlo, vuelve a tus documentos.')).toBeInTheDocument()
    expect(within(detail).getByRole('button', { name: 'Restaurar' })).toBeInTheDocument()
    expect(within(detail).getByRole('button', { name: 'Eliminar para siempre' })).toBeInTheDocument()
  })
})

describe('the selection of the Trash', () => {
  it('has the first document selected when the person arrives, and the panel says what it is', async () => {
    renderScreen('/trash')
    await findRow(first.title)

    expect(selectedRow()).toBe(row(first.title))
    const detail = panel(first.title)
    expect(within(detail).getByRole('heading', { level: 2, name: first.title })).toBeInTheDocument()
    expect(
      within(detail)
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual(['Archived', 'Folder', 'Created'])
    expect(
      within(detail)
        .getAllByRole('definition')
        .map((definition) => definition.textContent),
    ).toEqual(['Sep 19, 2026', 'No folder', 'Aug 31, 2026'])
    expect(within(detail).getByText('Restoring it puts it back in your documents.')).toBeInTheDocument()
    expect(within(detail).getByText(/This can't be undone\./)).toBeInTheDocument()
  })

  it('shows the folder and the dates of the document that is picked with the mouse', async () => {
    const { user } = renderScreen('/trash')
    await user.click(await within(main()).findByRole('button', { name: (name) => name.startsWith(second.title) }))

    expect(selectedRow()).toBe(row(second.title))
    expect(
      within(panel(second.title))
        .getAllByRole('definition')
        .map((definition) => definition.textContent),
    ).toEqual(['Sep 18, 2026', 'Product', 'Aug 30, 2026'])
    expect(within(main()).queryByRole('region', { name: first.title })).not.toBeInTheDocument()
  })

  it('says "No folder" when the folder of a document is not there any more', async () => {
    renderScreen('/trash', {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: async (request) => {
          const page = await dataSource.listDocuments(request)
          return { ...page, items: page.items.map((item) => ({ ...item, folderId: crypto.randomUUID() })) }
        },
      }),
    })
    await findRow(first.title)

    expect(row(second.title)).toHaveTextContent('· No folder')
    expect(within(panel(first.title)).getByText('No folder')).toBeInTheDocument()
  })

  it('is one stop of the tab order, on the selected row, and the next stop is the panel', async () => {
    const { user } = renderScreen('/trash')
    await findRow(first.title)

    screen.getByRole('heading', { level: 1, name: 'Trash' }).focus()

    await user.tab()
    expect(row(first.title)).toHaveFocus()
    await user.tab()
    expect(within(panel(first.title)).getByRole('button', { name: 'Restore' })).toHaveFocus()
  })

  it('moves with the arrow keys, Home and End, and the panel follows the row that has the focus', async () => {
    const { user } = renderScreen('/trash')
    await findRow(first.title)
    row(first.title).focus()

    await user.keyboard('{ArrowDown}')
    expect(row(second.title)).toHaveFocus()
    expect(selectedRow()).toBe(row(second.title))
    expect(panel(second.title)).toBeInTheDocument()

    await user.keyboard('{ArrowDown}')
    expect(selectedRow()).toBe(row(second.title))

    await user.keyboard('{Home}')
    expect(selectedRow()).toBe(row(first.title))
    await user.keyboard('{End}')
    expect(selectedRow()).toBe(row(second.title))
    await user.keyboard('{ArrowUp}')
    expect(selectedRow()).toBe(row(first.title))
  })

  it('selects a row that is clicked even where the browser does not focus a button on a click', async () => {
    renderScreen('/trash')
    await findRow(first.title)

    fireEvent.click(row(second.title))

    expect(selectedRow()).toBe(row(second.title))
  })

  it('selects a row that gets the focus, whichever way it got it', async () => {
    renderScreen('/trash')
    await findRow(first.title)

    act(() => row(second.title).focus())

    expect(selectedRow()).toBe(row(second.title))
    expect(row(second.title)).toHaveAttribute('tabindex', '0')
  })
})

describe('the states of the Trash screen', () => {
  it('shows a skeleton with a spoken status while the documents are on their way, under the headline the page already has', async () => {
    renderScreen('/trash', {
      wrap: (dataSource) => ({ ...dataSource, listDocuments: () => new Promise(() => undefined) }),
    })

    await heading()
    expect(await within(main()).findByText('Loading the trash')).toHaveAttribute('role', 'status')
    expect(within(main()).queryByRole('button')).not.toBeInTheDocument()
  })

  it('stays a skeleton while the folders are on their way, and does not say "No folder" in the meantime', async () => {
    let documentsRead = Promise.resolve<unknown>(undefined)
    renderScreen('/trash', {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: (request) => (documentsRead = dataSource.listDocuments(request)),
        listFolders: () => new Promise(() => undefined),
      }),
    })
    await within(main()).findByText('Loading the trash')

    // The documents are in by now: what is left to wait for is the folders.
    await act(async () => void (await documentsRead))

    expect(within(main()).getByText('Loading the trash')).toBeInTheDocument()
    expect(within(main()).queryByText(/No folder/)).not.toBeInTheDocument()
    expect(queryRow(first.title)).not.toBeInTheDocument()
  })

  it('says the trash is empty when nothing is archived, with no panel', async () => {
    renderScreen('/trash', {
      wrap: (dataSource) => ({ ...dataSource, listDocuments: async () => ({ items: [], nextCursor: null }) }),
    })

    expect(await within(main()).findByText('The trash is empty')).toBeInTheDocument()
    expect(within(main()).getByText('Documents you archive will appear here.')).toBeInTheDocument()
    expect(within(main()).queryByRole('list')).not.toBeInTheDocument()
    expect(within(main()).queryByRole('region')).not.toBeInTheDocument()
  })

  it.each([
    { case: 'the documents', failing: 'listDocuments' },
    { case: 'the folders', failing: 'listFolders' },
  ] as const)('says it could not read $case, and tries again when asked', async ({ failing }) => {
    let failures = 1
    const { user } = renderScreen('/trash', {
      wrap: (dataSource): DataSource => ({
        ...dataSource,
        [failing]: (request: never) => {
          if (failures-- > 0) return Promise.reject(answer(503, 'unavailable'))
          return (dataSource[failing] as (request: never) => Promise<unknown>)(request)
        },
      }),
    })

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load your documents")
    await user.click(within(main()).getByRole('button', { name: 'Try again' }))

    expect(await findRow(second.title)).toBeInTheDocument()
    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('tells a person who belongs to no workspace so, instead of a trash that would be empty for the wrong reason', async () => {
    renderScreen('/trash', {
      wrap: (dataSource) => ({ ...dataSource, listWorkspaces: async () => ({ items: [] }) }),
    })

    expect(await screen.findByText("You're not in a workspace yet")).toBeInTheDocument()
  })
})

describe('the way to the Trash', () => {
  it('is in the "More" menu of Documents, and Documents stays the current section there', async () => {
    const { user, router } = renderScreen('/documents')

    await user.click(await screen.findByRole('button', { name: 'More' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Trash' }))

    await heading()
    expect(router.state.location.pathname).toBe('/trash')
    expect(screen.getAllByRole('link', { current: 'page' }).map((link) => link.textContent)).toEqual(['Documents'])
  })
})

describe('the pages of the Trash screen', () => {
  it('loads the next page when asked, and moves the focus, and the selection, to the first document that arrived', async () => {
    const { user } = renderScreen('/trash', { wrap: onePerPage })
    await findRow(first.title)
    expect(within(main()).getAllByRole('listitem')).toHaveLength(1)

    await user.click(within(main()).getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(within(main()).getAllByRole('listitem')).toHaveLength(2))
    await waitFor(() => expect(row(second.title)).toHaveFocus())
    expect(selectedRow()).toBe(row(second.title))
  })

  it('stops offering more once the last page is in', async () => {
    const { user } = renderScreen('/trash', { wrap: onePerPage })

    await user.click(await within(main()).findByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(within(main()).getAllByRole('listitem')).toHaveLength(2))
    expect(within(main()).queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    expect(document.body).not.toHaveFocus()
  })

  it('says it could not load the next page without taking the list away, and loads it when asked again', async () => {
    let failures = 1
    const { user } = renderScreen('/trash', {
      wrap: (dataSource) => {
        const paged = onePerPage(dataSource)
        return {
          ...paged,
          listDocuments: (request) => {
            if (request?.params.query?.cursor !== undefined && failures-- > 0) {
              return Promise.reject(answer(503, 'unavailable'))
            }
            return paged.listDocuments(request)
          },
        }
      },
    })
    await user.click(await within(main()).findByRole('button', { name: 'Load more' }))

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load more documents.")
    expect(row(first.title)).toBeInTheDocument()
    expect(panel(first.title)).toBeInTheDocument()

    await user.click(within(main()).getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(within(main()).getAllByRole('listitem')).toHaveLength(2))
    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('the arrow keys after "Load more"', () => {
  it('go to the row after the one that has the focus, not after the one that was selected before', async () => {
    const { user } = renderScreen('/trash', {
      wrap: (dataSource) => {
        const archived = Promise.all(
          [fixtures.launchPlan, fixtures.designReview].map((document) =>
            dataSource.archiveDocument({ params: { path: { documentId: document.id } } }),
          ),
        )
        return {
          ...dataSource,
          listDocuments: async (request) => {
            await archived
            return dataSource.listDocuments({
              params: {
                path: { workspaceId: request?.params.path.workspaceId ?? '' },
                query: { ...request?.params.query, limit: 2 },
              },
            })
          },
        }
      },
    })
    await user.click(await within(main()).findByRole('button', { name: 'Load more' }))
    const rows = () => within(main()).getAllByRole('list')[0]?.querySelectorAll('button') ?? []
    await waitFor(() => expect(rows()).toHaveLength(4))
    const arrived = rows()[2]
    await waitFor(() => expect(arrived).toHaveFocus())

    await user.keyboard('{ArrowDown}')

    expect(rows()[3]).toHaveFocus()
    expect(selectedRow()).toBe(rows()[3])
  })
})
