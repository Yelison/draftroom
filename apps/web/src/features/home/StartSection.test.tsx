import { waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { renderScreen } from '../documents/testing/renderScreen.tsx'
import { failingOnce, main, never, overriding, renderHome, unavailable } from './testing/homeData.ts'

const start = () => within(main()).getByRole('region', { name: 'Start something new' })

/** Counts the documents that are asked for, and what they were asked to be made from. */
const watchingCreations = (requests: unknown[]) => (dataSource: DataSource) =>
  overriding({
    createDocument: (request) => {
      requests.push(request.body)
      return dataSource.createDocument(request)
    },
  })(dataSource)

describe('starting a document from Home', () => {
  it('offers the real templates, named and described, to start from', async () => {
    await renderHome()

    const tiles = await within(start()).findAllByRole('button', { name: /Meeting notes|Project brief|Weekly update/ })
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      'Meeting notesAgenda, decisions and who does what next.',
      'Project briefGoal, scope and timeline on one page.',
      'Weekly updateWhat moved this week and what is blocked.',
    ])
  })

  it('starts a blank document and opens it from "New document"', async () => {
    const requests: unknown[] = []
    const { user, router } = await renderHome({ wrap: watchingCreations(requests) })

    await user.click(within(start()).getByRole('button', { name: 'New document' }))

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/documents\/.+/))
    expect(requests).toEqual([{ title: 'Untitled document' }])
  })

  it('makes the document from the template that is chosen, in the language of the app, and opens it', async () => {
    const requests: unknown[] = []
    const { user, router } = await renderHome({ wrap: watchingCreations(requests) })

    await user.click(await within(start()).findByRole('button', { name: /Project brief/ }))

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/documents\/.+/))
    expect(requests).toEqual([{ title: 'Project brief', templateId: 'project-brief', locale: 'en' }])
  })

  it('names the templates in Spanish and makes the document in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    const requests: unknown[] = []
    const { user } = renderScreen('/', { wrap: watchingCreations(requests) })

    await user.click(await within(main()).findByRole('button', { name: /Notas de reunión/ }))

    await waitFor(() =>
      expect(requests).toEqual([{ title: 'Notas de reunión', templateId: 'meeting-notes', locale: 'es' }]),
    )
  })

  it('makes one document when the same template is chosen twice while it is on its way', async () => {
    const requests: unknown[] = []
    const { user } = await renderHome({
      wrap: (dataSource) =>
        overriding({
          createDocument: (request) => {
            requests.push(request.body)
            return never()
          },
        })(dataSource),
    })
    const tile = await within(start()).findByRole('button', { name: /Weekly update/ })

    await user.click(tile)
    await user.click(tile)

    expect(requests).toHaveLength(1)
  })

  it('says why the document could not be made, next to what was chosen', async () => {
    const { user } = await renderHome({
      wrap: overriding({
        createDocument: () => Promise.reject(unavailable()),
      }),
    })

    await user.click(await within(start()).findByRole('button', { name: /Project brief/ }))

    expect(await within(start()).findByRole('alert')).toBeInTheDocument()
  })

  it('says the templates could not be read, in the row, and tries again when asked, with "New document" still there', async () => {
    const { user } = await renderHome({ wrap: failingOnce('listTemplates') })

    expect(await within(start()).findByRole('alert')).toHaveTextContent("We couldn't load the templates")
    expect(within(start()).getByRole('button', { name: 'New document' })).toBeEnabled()
    await user.click(within(start()).getByRole('button', { name: 'Try again' }))

    expect(await within(start()).findByRole('button', { name: /Meeting notes/ })).toBeInTheDocument()
    expect(within(start()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('makes a blank document while the templates are failing', async () => {
    const { user, router } = await renderHome({ wrap: failingOnce('listTemplates') })
    await within(start()).findByRole('alert')

    await user.click(within(start()).getByRole('button', { name: 'New document' }))

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/documents\/.+/))
  })
})
