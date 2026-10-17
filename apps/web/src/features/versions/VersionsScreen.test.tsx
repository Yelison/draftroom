import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { budget } from '../../data/mock/fixtures/documents.ts'
import {
  launchPlan,
  launchPlanVersions,
  rowButton,
  openVersions,
  renderScreen,
  rows,
  versionRows,
  unavailable,
  versionsPath,
  when,
} from './testing/openVersions.tsx'

describe('the list of versions', () => {
  it('shows each version with what it is, who made it and when, newest first', async () => {
    await openVersions()

    const [newest, named, oldest] = rows()
    expect(within(newest!).getByRole('button', { name: rowButton.newest })).toBeInTheDocument()
    expect(newest).toHaveTextContent(when(launchPlanVersions.newest.createdAt))
    // An automatic version has no author: only the date is said.
    expect(newest).not.toHaveTextContent(' by ')
    expect(named).toHaveTextContent('Before the pricing review')
    expect(named).toHaveTextContent('Saved version')
    expect(named).toHaveTextContent(`${when(launchPlanVersions.named.createdAt)} by Marta Ruiz`)
    expect(oldest).toHaveTextContent(when(launchPlanVersions.oldest.createdAt))
    expect(rows()).toHaveLength(3)
  })

  it('says so when the document has no versions yet', async () => {
    renderScreen(versionsPath(budget.id))

    expect(await screen.findByText('No versions yet')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Versions' })).queryAllByRole('listitem')).toHaveLength(0)
  })

  it('says that the versions are on their way, and shows them when they arrive', async () => {
    let release = () => {}
    const waiting = new Promise<void>((resolve) => (release = resolve))
    renderScreen(versionsPath(launchPlan.id), {
      wrap: (dataSource) => ({
        ...dataSource,
        listVersions: async (request) => {
          await waiting
          return dataSource.listVersions(request)
        },
      }),
    })

    // The document is there and the list is not: the list says so where it will be.
    const section = await screen.findByRole('region', { name: 'Versions' })
    expect(within(section).getByText('Loading the versions')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Version history' })).toBeInTheDocument()
    release()

    expect(await versionRows()).toHaveLength(3)
    expect(screen.queryByText('Loading the versions')).not.toBeInTheDocument()
  })

  it('offers to try again when the versions cannot be loaded, and shows them once they can', async () => {
    let failing = true
    const view = renderScreen(versionsPath(launchPlan.id), {
      wrap: (dataSource: DataSource) => ({
        ...dataSource,
        listVersions: async (request) => {
          if (failing) throw unavailable()
          return dataSource.listVersions(request)
        },
      }),
    })

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the versions")
    failing = false
    await view.user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await versionRows()).toHaveLength(3)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('loads the next page on request and keeps the rows it has', async () => {
    const view = renderScreen(versionsPath(launchPlan.id), {
      wrap: (dataSource) => ({
        ...dataSource,
        listVersions: (request) =>
          dataSource.listVersions(
            request === undefined
              ? request
              : { ...request, params: { ...request.params, query: { ...request.params.query, limit: 2 } } },
          ),
      }),
    })
    await versionRows()
    expect(rows()).toHaveLength(2)

    await view.user.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    // "Load more" went away with the last page: the focus is on the first row that arrived, not on the page.
    expect(within(rows()[2]!).getByRole('button', { name: rowButton.oldest })).toHaveFocus()
  })
})

describe('the way in and out of the history', () => {
  it('is a link from the editor, and the document is one link away', async () => {
    const view = renderScreen(`/documents/${launchPlan.id}`)

    await view.user.click(await screen.findByRole('link', { name: 'Versions' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Version history' })).toBeInTheDocument()
    await versionRows()
    expect(view.router.state.location.pathname).toBe(versionsPath(launchPlan.id))

    await view.user.click(screen.getByRole('link', { name: 'Back to “Autumn launch plan”' }))
    expect(await screen.findByRole('textbox', { name: 'Document title' })).toBeInTheDocument()
  })

  it('is open to a person who can only read the document', async () => {
    renderScreen(versionsPath(launchPlan.id), { signedInAs: 'sofia@harborpine.example' })

    expect(await versionRows()).toHaveLength(3)
    expect(screen.getByRole('link', { name: /Back to/ })).toBeInTheDocument()
  })

  it('says that the document is not there when it is not, and lists no versions', async () => {
    renderScreen(versionsPath('00000000-0000-4000-8000-00000000dead'))

    expect(await screen.findByRole('alert')).toHaveTextContent("This document isn't available")
    expect(screen.queryByRole('region', { name: 'Versions' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Documents' })).toBeInTheDocument()
  })
})
