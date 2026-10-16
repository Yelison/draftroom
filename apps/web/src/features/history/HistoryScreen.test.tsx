import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import {
  daniel,
  fixtures,
  inPagesOf,
  main,
  marta,
  newestSentences,
  renderScreen,
  sentenceOf,
  unavailable,
  watchingHistory,
  type Calls,
} from './testing/openHistory.tsx'

const heading = () => screen.findByRole('heading', { level: 1, name: 'History' })
const chip = (name: string | RegExp) => within(main()).getByRole('button', { name })
const days = () => within(main()).getAllByRole('heading', { level: 2 })
const rows = () =>
  within(main()).getAllByRole('button', { name: / (renamed|commented|replied|created|resolved|saved|gave|changed)/ })

/** How many different days the events of the seed fall on, where the person is: the instants are fixed, the days are not. */
const daysOfTheSeed = () =>
  new Set(
    [
      '2026-09-14T09:00',
      '2026-09-15T10:00',
      '2026-10-10T14:00',
      '2026-10-11T08:30',
      '2026-10-12T09:10',
      '2026-10-12T17:45',
    ]
      .concat(['2026-10-13T08:42', '2026-10-07T15:00', '2026-10-01T09:00', '2026-10-02T08:00'])
      .map((instant) => new Intl.DateTimeFormat('en', { dateStyle: 'full' }).format(new Date(`${instant}:00.000Z`))),
  ).size

describe('the History screen', () => {
  it('lists what happened across the documents, newest first, with each day written once above its first event', async () => {
    renderScreen('/history')
    await heading()
    await within(main()).findByRole('button', { name: sentenceOf(newestSentences[0]) })

    expect(
      rows()
        .slice(0, 4)
        .map((row) => row.textContent),
    ).toEqual(newestSentences.map((sentence) => expect.stringContaining(sentence)))
    // Fourteen events, and the day is written when it changes, not on every row.
    expect(rows()).toHaveLength(14)
    expect(days()).toHaveLength(daysOfTheSeed())
    expect(days()[0]).toHaveTextContent(
      new Intl.DateTimeFormat('en', { dateStyle: 'full' }).format(new Date('2026-10-13T08:42:00.000Z')),
    )
  })

  it('tells the owner of a document who was given access, and tells nobody else', async () => {
    renderScreen('/history')
    expect(
      await within(main()).findByText('Marta Ruiz gave Daniel Okafor access to “Autumn launch plan”'),
    ).toBeInTheDocument()
  })

  it('does not tell a person who owns nothing how a document is shared', async () => {
    renderScreen('/history', { signedInAs: daniel.email })

    await within(main()).findByRole('button', { name: /created “Presupuesto 2027”/ })
    expect(within(main()).queryByText(/access to/)).not.toBeInTheDocument()
  })

  it('says a version saved on its own without naming anyone, and a change of access without the person it is about', async () => {
    renderScreen('/history', {
      wrap: (dataSource) => ({
        ...dataSource,
        listWorkspaceActivity: async () => ({
          items: [
            {
              id: '9d1f3a5c-7c8e-4a0f-8bcd-9f1b3d5a7c01',
              type: 'version.created',
              createdAt: '2026-10-13T09:00:00.000Z',
              actor: null,
              document: { id: fixtures.launchPlan.id, title: fixtures.launchPlan.title },
              targetUser: null,
            },
            {
              id: '9d1f3a5c-7c8e-4a0f-8bcd-9f1b3d5a7c02',
              type: 'access.revoked',
              createdAt: '2026-10-13T08:00:00.000Z',
              actor: { id: marta.id, name: 'Marta Ruiz' },
              document: { id: fixtures.launchPlan.id, title: fixtures.launchPlan.title },
              targetUser: null,
            },
          ],
          nextCursor: null,
        }),
      }),
    })

    expect(
      await within(main()).findByText('A version of “Autumn launch plan” was saved automatically'),
    ).toBeInTheDocument()
    expect(within(main()).getByText("Marta Ruiz removed someone's access to “Autumn launch plan”")).toBeInTheDocument()
  })

  it('writes the days, the times and the sentences in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/history')

    expect(await screen.findByRole('heading', { level: 1, name: 'Historial' })).toBeInTheDocument()
    expect(
      await within(main()).findByRole('button', { name: /Marta Ruiz cambió el nombre de «Autumn launch plan»/ }),
    ).toBeInTheDocument()
    expect(within(main()).getByRole('group', { name: 'Filtrar el historial' })).toBeInTheDocument()
    expect(days()[0]).toHaveTextContent(
      new Intl.DateTimeFormat('es', { dateStyle: 'full' }).format(new Date('2026-10-13T08:42:00.000Z')),
    )
  })

  it('shows a skeleton with a spoken status while the history is on its way, under the headline the page already has', async () => {
    renderScreen('/history', {
      wrap: (dataSource) => ({ ...dataSource, listWorkspaceActivity: () => new Promise(() => undefined) }),
    })

    await heading()
    expect(await within(main()).findByText('Loading the history')).toHaveAttribute('role', 'status')
    expect(within(main()).getByRole('group', { name: 'Filter the history' })).toBeInTheDocument()
  })

  it('says nothing has happened when the history is empty', async () => {
    renderScreen('/history', {
      wrap: (dataSource) => ({ ...dataSource, listWorkspaceActivity: async () => ({ items: [], nextCursor: null }) }),
    })

    expect(await within(main()).findByText('Nothing has happened yet')).toBeInTheDocument()
    expect(within(main()).queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('says it could not read the history, and tries again when asked', async () => {
    let failures = 1
    const { user } = renderScreen('/history', {
      wrap: (dataSource) => ({
        ...dataSource,
        listWorkspaceActivity: (request) => {
          if (failures-- > 0) return Promise.reject(unavailable())
          return dataSource.listWorkspaceActivity(request)
        },
      }),
    })

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load the history")
    await user.click(within(main()).getByRole('button', { name: 'Try again' }))

    expect(await within(main()).findByRole('button', { name: sentenceOf(newestSentences[0]) })).toBeInTheDocument()
    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('goes on with "Load more", and puts the focus on the first event that arrived when the last page is in', async () => {
    const calls: Calls = []
    const { user } = renderScreen('/history', { wrap: inPagesOf(10, calls) })
    await within(main()).findByRole('button', { name: sentenceOf(newestSentences[0]) })
    expect(rows()).toHaveLength(10)

    await user.click(within(main()).getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(rows()).toHaveLength(14))
    expect(within(main()).queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    expect(rows()[10]).toHaveFocus()
    expect(calls.map((call) => call.params.query?.cursor !== undefined)).toEqual([false, true])
  })
})

describe('the filters of the History screen', () => {
  // Only the date is held still, so that "last 7 days" means the same on every day the tests run; timers keep running.
  const holdTheDate = () => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T10:00:00.000Z') })
  afterEach(() => vi.useRealTimers())

  it('narrow the list to one document, say so on the chip, and keep the choice in the address', async () => {
    const { user, router } = renderScreen('/history')
    await within(main()).findByRole('button', { name: sentenceOf(newestSentences[0]) })

    await user.click(chip('Document'))
    await user.click(await screen.findByRole('menuitemradio', { name: fixtures.designReview.title }))

    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(chip(`Document: ${fixtures.designReview.title}`)).toHaveAttribute('aria-expanded', 'false')
    expect(within(main()).getByRole('status')).toHaveTextContent('3 events')
    expect(router.state.location.search).toBe(`?document=${fixtures.designReview.id}`)
    // The focus is back on the chip that opened the menu.
    expect(chip(`Document: ${fixtures.designReview.title}`)).toHaveFocus()
  })

  it('combine: a document, a person and a period each take away what the others left', async () => {
    holdTheDate()
    const { user } = renderScreen('/history')
    await within(main()).findByRole('button', { name: sentenceOf(newestSentences[0]) })

    await user.click(chip('Document'))
    await user.click(await screen.findByRole('menuitemradio', { name: fixtures.launchPlan.title }))
    await waitFor(() => expect(rows()).toHaveLength(9))
    await user.click(chip('Person'))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Marta Ruiz' }))
    await waitFor(() => expect(rows()).toHaveLength(7))
    await user.click(chip('Period'))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Last 7 days' }))

    await waitFor(() => expect(rows()).toHaveLength(4))
    expect(chip('Document: Autumn launch plan')).toBeInTheDocument()
    expect(chip('Person: Marta Ruiz')).toBeInTheDocument()
    expect(chip('Period: Last 7 days')).toBeInTheDocument()
  })

  it('open on the filters the address names, and ignore a value that is not one of them', async () => {
    renderScreen(`/history?person=${daniel.id}&range=never&document=not-an-id`)

    await within(main()).findByRole('button', { name: /Daniel Okafor created “Notas de la revisión de diseño”/ })
    expect(chip('Person: Daniel Okafor')).toBeInTheDocument()
    expect(chip('Period')).toBeInTheDocument()
    expect(chip('Document')).toBeInTheDocument()
  })

  it('ask for a period with one instant, the same for every page, or the cursor of the first would be refused', async () => {
    holdTheDate()
    const calls: Calls = []
    const { user } = renderScreen('/history?range=month', { wrap: inPagesOf(1, calls) })
    await waitFor(() => expect(calls).toHaveLength(1))

    await within(main()).findByRole('button', { name: 'Load more' })
    // Five minutes go by before the next page is asked for: a period counted from the clock would have moved.
    vi.setSystemTime(new Date('2026-10-14T10:05:00.000Z'))
    await user.click(within(main()).getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(calls).toHaveLength(2))

    const instants = calls.map((call) => call.params.query?.from)
    expect(instants[0]).toBeDefined()
    expect(instants[1]).toBe(instants[0])
    await waitFor(() => expect(rows()).toHaveLength(2))
  })

  it('say that no event matches, and take every filter off from the button that says so', async () => {
    holdTheDate()
    const { user, router } = renderScreen(`/history?person=${marta.id}&range=today`)

    expect(await within(main()).findByText('No events match these filters')).toBeInTheDocument()
    await user.click(within(main()).getByRole('button', { name: 'Clear filters' }))

    expect(await within(main()).findByRole('button', { name: sentenceOf(newestSentences[0]) })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    // The button went with the filters: the focus stays among them.
    expect(chip('Document')).toHaveFocus()
  })

  it('are a group with a name, one chip each, and a menu that offers every choice and the way to take it off', async () => {
    const { user } = renderScreen('/history')
    await within(main()).findByRole('button', { name: sentenceOf(newestSentences[0]) })

    const group = within(main()).getByRole('group', { name: 'Filter the history' })
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Document', 'Person', 'Period'])
    await user.click(within(group).getByRole('button', { name: 'Period' }))

    const options = await screen.findAllByRole('menuitemradio')
    expect(options.map((option) => option.textContent)).toEqual(['Any time', 'Today', 'Last 7 days', 'Last 30 days'])
    expect(options[0]).toBeChecked()
  })

  it('say that a list of choices could not be read, and read it again when asked', async () => {
    let failures = 1
    const { user } = renderScreen('/history', {
      wrap: (dataSource) => ({
        ...dataSource,
        listMembers: (request) => {
          if (failures-- > 0) return Promise.reject(unavailable())
          return dataSource.listMembers(request)
        },
      }),
    })
    await within(main()).findByRole('button', { name: sentenceOf(newestSentences[0]) })

    await user.click(chip('Person'))
    await user.click(await screen.findByRole('menuitem', { name: "Couldn't load the list. Try again" }))
    await user.click(chip('Person'))

    expect(await screen.findByRole('menuitemradio', { name: 'Marta Ruiz' })).toBeInTheDocument()
  })
})

describe('opening an event of the History screen', () => {
  it('shows what it says beside the list, puts the focus on the panel, and gives it back to the row when it closes', async () => {
    const { user } = renderScreen('/history')
    const row = await within(main()).findByRole('button', { name: sentenceOf(newestSentences[0]) })

    await user.click(row)

    const panel = within(main()).getByRole('complementary', { name: 'Event details' })
    expect(within(panel).getByRole('heading', { level: 2, name: 'Event details' })).toHaveFocus()
    expect(within(panel).getByText(newestSentences[0])).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Open document' })).toHaveAttribute(
      'href',
      `/documents/${fixtures.launchPlan.id}`,
    )
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(row).toHaveAttribute('aria-controls', panel.id)

    await user.click(within(panel).getByRole('button', { name: 'Close' }))

    expect(within(main()).queryByRole('complementary')).not.toBeInTheDocument()
    expect(row).toHaveFocus()
    expect(row).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens with the keyboard alone', async () => {
    const { user } = renderScreen('/history')
    const row = await within(main()).findByRole('button', { name: sentenceOf(newestSentences[0]) })

    row.focus()
    await user.keyboard('{Enter}')

    expect(within(main()).getByRole('heading', { level: 2, name: 'Event details' })).toHaveFocus()
  })

  it('says it is no longer available when the person loses access to its document, and keeps the focus where it is', async () => {
    const { user, server, queryClient } = renderScreen('/history', { signedInAs: daniel.email })
    const budget = await within(main()).findByRole('button', { name: /created “Presupuesto 2027”/ })
    await user.click(budget)
    expect(within(main()).getByRole('complementary')).toHaveTextContent('Presupuesto 2027')

    await server.connect({ signedInAs: marta.email }).removeAccess({
      params: { path: { documentId: fixtures.budget.id, userId: daniel.id } },
    })
    await queryClient.invalidateQueries()

    const panel = within(main()).getByRole('complementary')
    expect(await within(panel).findByRole('alert')).toHaveTextContent('This event is no longer available')
    expect(within(panel).queryByText(/Presupuesto 2027/)).not.toBeInTheDocument()
    expect(within(panel).queryByRole('link', { name: 'Open document' })).not.toBeInTheDocument()
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveFocus()
    expect(within(main()).queryByRole('button', { name: /Presupuesto 2027/ })).not.toBeInTheDocument()
  })

  it('closes when another filter is chosen, instead of saying the event is gone', async () => {
    const { user } = renderScreen('/history')
    await user.click(await within(main()).findByRole('button', { name: sentenceOf(newestSentences[0]) }))

    await user.click(chip('Document'))
    await user.click(await screen.findByRole('menuitemradio', { name: fixtures.designReview.title }))

    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(within(main()).queryByRole('complementary')).not.toBeInTheDocument()
  })
})

describe('the History screen with the calls it makes', () => {
  it('asks for the history of the workspace once, with no filter, when nothing is chosen', async () => {
    const calls: Calls = []
    renderScreen('/history', { wrap: watchingHistory(calls) })
    await within(main()).findByRole('button', { name: sentenceOf(newestSentences[0]) })

    expect(calls.map((call) => call.params.query)).toEqual([{}])
  })
})
