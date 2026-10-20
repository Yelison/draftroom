import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { budget } from '../../data/mock/fixtures/documents.ts'
import { marta } from '../../data/mock/fixtures/index.ts'
import {
  automaticToggle,
  choose,
  launchPlan,
  launchPlanVersions,
  listing,
  makeVersion,
  openVersions,
  renderScreen,
  replacing,
  rows,
  time,
  unavailable,
  versionsPath,
} from './testing/openVersions.tsx'

/** The list has its versions: the switch is off while they load. */
const listArrived = () => waitFor(() => expect(automaticToggle()).toBeEnabled())
const list = () => screen.getByRole('region', { name: 'Versions' })
const author = { id: marta.id, name: 'Marta Ruiz' }

describe('what the list shows of each version', () => {
  it('shows the name, who made it and when, and how big it is', async () => {
    await openVersions()

    const [named] = rows()
    expect(named).toHaveTextContent('Before the pricing review')
    expect(named).toHaveTextContent(`${time(launchPlanVersions.named.createdAt)} by Marta Ruiz`)
    expect(named).toHaveTextContent('4 kB')
  })

  it('gives an automatic version the clock where a person would have their avatar, and names nobody', async () => {
    const { user } = await openVersions()
    await user.click(automaticToggle())

    const [newest, named] = rows()
    expect(newest).toHaveTextContent(`Automatic version${time(launchPlanVersions.newest.createdAt)}`)
    expect(newest).not.toHaveTextContent(' by ')
    expect(newest?.querySelector('svg')).not.toBeNull()
    expect(named?.querySelector('svg')).toBeNull()
    expect(named).toHaveTextContent('MR')
  })

  it('says what a restore is when it carries the name of the version it went back to', async () => {
    renderScreen(versionsPath(launchPlan.id), {
      wrap: listing([
        makeVersion({
          id: 'v1',
          kind: 'restore',
          label: 'Before the pricing review',
          createdAt: '2026-10-11T09:00:00.000Z',
          createdBy: author,
        }),
      ]),
    })

    await listArrived()
    const [restored] = rows()
    expect(restored).toHaveTextContent('Before the pricing review')
    expect(restored).toHaveTextContent('Restored version')
  })
})

describe('the sizes', () => {
  it.each([
    { sizeBytes: 640, shown: '640 byte' },
    { sizeBytes: 3180, shown: '3 kB' },
    { sizeBytes: 1_400_000, shown: '1.4 MB' },
  ])('are told in the unit that suits them: $sizeBytes bytes are $shown', async ({ sizeBytes, shown }) => {
    renderScreen(versionsPath(launchPlan.id), {
      wrap: listing([makeVersion({ id: 'v1', createdAt: '2026-10-11T09:00:00.000Z', sizeBytes })]),
    })

    await listArrived()
    const [row] = rows()
    expect(row).toHaveTextContent(shown)
  })
})

describe('the days', () => {
  afterEach(() => vi.useRealTimers())

  // Noon of the 14th in the machine's own zone, so the days are the same wherever the test runs.
  const noon = new Date(2026, 9, 14, 12)
  const at = (days: number, hour: number) => new Date(2026, 9, 14 - days, hour).toISOString()

  it('names today and yesterday and gives the date of every other day, newest first', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: noon })
    renderScreen(versionsPath(launchPlan.id), {
      wrap: listing([
        makeVersion({ id: 'v1', label: 'Late today', createdAt: at(0, 11) }),
        makeVersion({ id: 'v2', label: 'Early today', createdAt: at(0, 8) }),
        makeVersion({ id: 'v3', label: 'Yesterday evening', createdAt: at(1, 23) }),
        makeVersion({ id: 'v4', label: 'Days ago', createdAt: at(4, 9) }),
      ]),
    })

    await listArrived()

    const headings = within(list())
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
    expect(headings).toEqual([
      'Today',
      'Yesterday',
      new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(2026, 9, 10)),
    ])
    const groups = within(list())
      .getAllByRole('list')
      .map((group) => within(group).getAllByRole('listitem').length)
    expect(groups).toEqual([2, 1, 1])
  })

  it('compares days of the calendar, not hours: a version of 11 pm is yesterday at 1 am', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 1) })
    renderScreen(versionsPath(launchPlan.id), {
      wrap: listing([makeVersion({ id: 'v1', label: 'Night', createdAt: at(1, 23) })]),
    })

    await listArrived()

    expect(within(list()).getByRole('heading', { level: 3 })).toHaveTextContent('Yesterday')
  })
})

describe('the automatic versions', () => {
  it('are hidden at first, and the switch shows them without changing its name', async () => {
    const { user } = await openVersions()
    expect(rows()).toHaveLength(1)
    expect(automaticToggle()).toHaveAttribute('aria-pressed', 'false')

    await user.click(automaticToggle())

    expect(rows()).toHaveLength(3)
    expect(automaticToggle()).toHaveAttribute('aria-pressed', 'true')
    expect(automaticToggle()).toHaveAccessibleName('Show automatic versions')
  })

  it('are dimmed against what a person kept', async () => {
    const { user } = await openVersions()
    await user.click(automaticToggle())

    const [newest, named] = rows()
    expect(choose(newest!).className).toContain('automatic')
    expect(choose(named!).className).not.toContain('automatic')
  })

  it('leave in sight the versions a restore makes: they are the person’s, not the server’s', async () => {
    renderScreen(versionsPath(launchPlan.id), {
      wrap: listing([
        makeVersion({ id: 'v1', kind: 'restore', createdAt: '2026-10-13T10:00:00.000Z', createdBy: author }),
        makeVersion({ id: 'v2', kind: 'pre-restore', createdAt: '2026-10-13T10:00:00.000Z', createdBy: author }),
        makeVersion({ id: 'v3', kind: 'auto', createdAt: '2026-10-13T09:00:00.000Z' }),
      ]),
    })

    await listArrived()

    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining('Restored version'),
      expect.stringContaining('Version before a restore'),
    ])
  })

  it('keep in the list the one that is read when they are hidden again, so the list says which it is', async () => {
    const { user } = await openVersions()
    await user.click(automaticToggle())
    await user.click(choose(rows()[0]!))
    expect(choose(rows()[0]!)).toHaveAttribute('aria-current', 'true')

    await user.click(automaticToggle())

    expect(rows()).toHaveLength(2)
    expect(choose(rows()[0]!)).toHaveAttribute('aria-current', 'true')
  })
})

describe('choosing a version', () => {
  it('opens the newest one that is shown, marked in the list', async () => {
    await openVersions()

    expect(choose(rows()[0]!)).toHaveAttribute('aria-current', 'true')
  })

  it('is done with the keyboard: Tab reaches each version and Enter reads it', async () => {
    const { user } = await openVersions()
    await user.click(automaticToggle())
    const [newest, , oldest] = rows()
    choose(newest!).focus()

    await user.tab()
    await user.tab()
    expect(choose(oldest!)).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(choose(oldest!)).toHaveAttribute('aria-current', 'true')
    expect(choose(newest!)).not.toHaveAttribute('aria-current')
    expect(await screen.findByText(/The launch is planned for the first week of November/)).toBeInTheDocument()
    // The focus stays on the version that was chosen: the list is not remade under it.
    expect(choose(oldest!)).toHaveFocus()
  })

  it('does not change what is read when a version arrives after the person began', async () => {
    const { user, queryClient } = await openVersions()
    await user.click(automaticToggle())
    await user.click(choose(rows()[2]!))
    await screen.findByText(/first week of November/)

    await act(() => queryClient.invalidateQueries({ queryKey: ['documents', launchPlan.id, 'versions'] }))

    expect(screen.getByText(/first week of November/)).toBeInTheDocument()
  })
})

describe('the states of the list', () => {
  it('says that the document has no versions yet', async () => {
    renderScreen(versionsPath(budget.id))

    expect(await screen.findByText('No versions yet')).toBeInTheDocument()
    expect(within(list()).queryAllByRole('listitem')).toHaveLength(0)
    expect(await screen.findByText('There is no version to read yet')).toBeInTheDocument()
  })

  it('says that there are only automatic ones while the switch is off, and shows them when it is on', async () => {
    const { user } = renderScreen(versionsPath(launchPlan.id), {
      wrap: listing([makeVersion({ id: 'v1', kind: 'auto', createdAt: '2026-10-13T09:00:00.000Z' })]),
    })
    expect(await screen.findByText('There are only automatic versions')).toBeInTheDocument()
    expect(screen.queryByText('No versions yet')).not.toBeInTheDocument()
    expect(within(list()).queryAllByRole('listitem')).toHaveLength(0)

    await user.click(automaticToggle())

    expect(rows()).toHaveLength(1)
    expect(screen.queryByText('There are only automatic versions')).not.toBeInTheDocument()
  })

  it('says that the versions are on their way, where they will be, and shows them when they arrive', async () => {
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
    await screen.findByRole('link', { name: /^Back to the document/ })
    expect(within(list()).getByText('Loading the versions')).toBeInTheDocument()
    expect(automaticToggle()).toBeDisabled()
    release()

    await waitFor(() => expect(automaticToggle()).toBeEnabled())
    expect(screen.queryByText('Loading the versions')).not.toBeInTheDocument()
  })

  it('offers to try again when the versions cannot be loaded, and shows them once they can', async () => {
    let failing = true
    const view = renderScreen(versionsPath(launchPlan.id), {
      wrap: (dataSource) => ({
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

    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('"Load more"', () => {
  const pages = (second: Parameters<typeof makeVersion>[0][]) =>
    replacing({
      listVersions: async (request) =>
        request?.params.query?.cursor === undefined
          ? {
              items: [makeVersion({ id: 'v1', label: 'Newest', createdAt: '2026-10-13T09:00:00.000Z' })],
              nextCursor: 'next',
            }
          : { items: second.map(makeVersion), nextCursor: null },
    })

  it('adds the next page to the rows it has, and the focus goes to the first row that arrived', async () => {
    const view = renderScreen(versionsPath(launchPlan.id), {
      wrap: pages([{ id: 'v2', label: 'Older', createdAt: '2026-10-12T09:00:00.000Z' }]),
    })
    await listArrived()

    await view.user.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    expect(choose(rows()[1]!)).toHaveFocus()
  })

  it('leaves the focus on the switch when the last page brings only automatic versions, which are hidden', async () => {
    const view = renderScreen(versionsPath(launchPlan.id), {
      wrap: pages([{ id: 'v2', kind: 'auto', createdAt: '2026-10-12T09:00:00.000Z' }]),
    })
    await listArrived()

    await view.user.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument())
    expect(rows()).toHaveLength(1)
    expect(automaticToggle()).toHaveFocus()
  })
})
