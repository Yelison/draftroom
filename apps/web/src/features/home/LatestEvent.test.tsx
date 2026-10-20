import { within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { marta } from '../../data/mock/fixtures/index.ts'
import { renderScreen, workspaceFixtures } from '../documents/testing/renderScreen.tsx'
import { failingOnce, main, never, overriding, renderHome } from './testing/homeData.ts'

const latest = () => within(main()).findByRole('region', { name: 'Latest' })

/** The newest event of the workspace as the data layer has it, read the way the screen reads it. */
async function newestEvent(server: ReturnType<typeof renderScreen>['server']) {
  const page = await server
    .connect({ signedInAs: marta.email })
    .listWorkspaceActivity({ params: { path: { workspaceId: workspaceFixtures.harborPine.id }, query: { limit: 1 } } })
  const [event] = page.items
  if (event === undefined) throw new Error('The mock has no event')
  return event
}

describe('the latest event of Home', () => {
  it('says the newest event in one line, with its time and the way to all of them', async () => {
    const limits: unknown[] = []
    const { server } = await renderHome({
      wrap: (dataSource) =>
        overriding({
          listWorkspaceActivity: (request) => {
            limits.push(request.params.query?.limit)
            return dataSource.listWorkspaceActivity(request)
          },
        })(dataSource),
    })
    const event = await newestEvent(server)

    const line = await latest()
    expect(line).toHaveTextContent(event.document.title)
    expect(line).toHaveTextContent(event.actor?.name ?? '')
    expect(within(line).getByText((_, element) => element?.tagName === 'TIME')).toHaveAttribute(
      'datetime',
      event.createdAt,
    )
    expect(within(line).getByRole('link', { name: 'See all activity' })).toHaveAttribute('href', '/history')
    expect(limits).toContain(1)
  })

  it('says the time alone for an event of today, and the day too for an older one', async () => {
    const { server } = await renderHome({
      wrap: (dataSource) =>
        overriding({
          listWorkspaceActivity: async (request) => {
            const page = await dataSource.listWorkspaceActivity(request)
            return { ...page, items: page.items.map((item) => ({ ...item, createdAt: new Date().toISOString() })) }
          },
        })(dataSource),
    })
    await newestEvent(server)

    expect(await latest()).not.toHaveTextContent(String(new Date().getFullYear()))
  })

  it('names the day of an event that is not from today', async () => {
    const { server } = await renderHome()
    const event = await newestEvent(server)

    expect(await latest()).toHaveTextContent(String(new Date(event.createdAt).getFullYear()))
  })

  it('draws no line, and no way to the history, when nothing has happened', async () => {
    await renderHome({ wrap: overriding({ listWorkspaceActivity: async () => ({ items: [], nextCursor: null }) }) })
    await within(main()).findByRole('region', { name: 'Pick up where you left off' })

    expect(within(main()).queryByRole('region', { name: 'Latest' })).not.toBeInTheDocument()
    expect(within(main()).queryByRole('link', { name: 'See all activity' })).not.toBeInTheDocument()
    expect(within(main()).queryByText('Loading the latest activity')).not.toBeInTheDocument()
  })

  it('credits a version the server saved on its own to nobody, with a clock and not initials', async () => {
    await renderHome({
      wrap: (dataSource) =>
        overriding({
          listWorkspaceActivity: async (request) => {
            const page = await dataSource.listWorkspaceActivity(request)
            return { ...page, items: page.items.map((item) => ({ ...item, type: 'version.created', actor: null })) }
          },
        })(dataSource),
    })

    const line = await latest()
    expect(line).toHaveTextContent(/A version of “.+” was saved automatically/)
    // The avatar of a person is its initials: nobody did this, so there are none.
    expect(within(line).queryByText(/^[A-Z]{1,2}$/)).not.toBeInTheDocument()
    expect(line.querySelector('svg')).toBeInTheDocument()
  })

  it('shows a skeleton with a spoken status while it is on its way', async () => {
    renderScreen('/', { wrap: overriding({ listWorkspaceActivity: never }) })

    expect(await within(main()).findByText('Loading the latest activity')).toHaveAttribute('role', 'status')
  })

  it('says it could not read it, and tries again when asked, without touching the rest', async () => {
    const { user } = await renderHome({ wrap: failingOnce('listWorkspaceActivity') })

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load the latest activity")
    expect(within(main()).getByRole('region', { name: 'Pick up where you left off' })).toBeInTheDocument()
    await user.click(within(main()).getByRole('button', { name: 'Try again' }))

    expect(await within(main()).findByRole('link', { name: 'See all activity' })).toBeInTheDocument()
  })
})
