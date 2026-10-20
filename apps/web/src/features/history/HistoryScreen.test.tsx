import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { activityEvent } from './testing/activityEvent.ts'
import {
  daniel,
  findRow,
  fixtures,
  inPagesOf,
  main,
  marta,
  newestSentences,
  renderScreen,
  rows,
  sofia,
  unavailable,
  watchingHistory,
  withPages,
  type Calls,
} from './testing/openHistory.tsx'

const heading = () => screen.findByRole('heading', { level: 1, name: 'History' })
const chip = (name: string | RegExp) => within(main()).getByRole('button', { name })
const weeks = () => within(main()).getAllByRole('heading', { level: 2 })
const days = () => within(main()).getAllByRole('heading', { level: 3 })

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
    await findRow(newestSentences[0])

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
    expect(await findRow('Marta Ruiz gave Daniel Okafor access to “Autumn launch plan”')).toBeInTheDocument()
  })

  it('does not tell a person who owns nothing how a document is shared', async () => {
    renderScreen('/history', { signedInAs: daniel.email })

    await findRow('created “Presupuesto 2027”')
    expect(within(main()).queryByText(/access to/)).not.toBeInTheDocument()
  })

  it('does not label anything as Access for a person who owns none of the documents those changes are about', async () => {
    renderScreen('/history', { signedInAs: sofia.email })

    await findRow('Sofía Lindqvist commented on “Autumn launch plan”')
    expect(within(main()).queryByText('Access')).not.toBeInTheDocument()
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

    const automatic = await findRow('A version of “Autumn launch plan” was saved automatically')
    // Nobody did it, so there is no person's initial to read as one: a clock stands where the avatar would.
    expect(within(automatic).queryByText('D')).not.toBeInTheDocument()
    expect(automatic.querySelector('svg')).toBeInTheDocument()
    expect(await findRow("Marta Ruiz removed someone's access to “Autumn launch plan”")).toBeInTheDocument()
  })

  it('writes the days, the times and the sentences in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/history')

    expect(await screen.findByRole('heading', { level: 1, name: 'Historial' })).toBeInTheDocument()
    expect(await findRow('Marta Ruiz cambió el nombre de «Autumn launch plan»')).toBeInTheDocument()
    expect(within(main()).getByRole('group', { name: 'Filtrar el historial' })).toBeInTheDocument()
    expect(days()[0]).toHaveTextContent(
      new Intl.DateTimeFormat('es', { dateStyle: 'full' }).format(new Date('2026-10-13T08:42:00.000Z')),
    )
    expect(weeks()[0]).toHaveTextContent(/^Semana del \d+ \p{L}+/u)
  })

  it('shows a skeleton with a spoken status while the history is on its way, under the headline the page already has', async () => {
    renderScreen('/history', {
      wrap: (dataSource) => ({ ...dataSource, listWorkspaceActivity: () => new Promise(() => undefined) }),
    })

    await heading()
    // The filters are there, which the workspace's own skeleton has not: this is the history that is on its way.
    expect(await within(main()).findByRole('group', { name: 'Filter the history' })).toBeInTheDocument()
    expect(within(main()).getByText('Loading the history')).toHaveAttribute('role', 'status')
    expect(within(main()).queryByText('Nothing has happened yet')).not.toBeInTheDocument()
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

    expect(await findRow(newestSentences[0])).toBeInTheDocument()
    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('goes on with "Load more", and puts the focus on the first event that arrived when the last page is in', async () => {
    const calls: Calls = []
    const { user } = renderScreen('/history', { wrap: inPagesOf(10, calls) })
    await findRow(newestSentences[0])
    expect(rows()).toHaveLength(10)

    await user.click(within(main()).getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(rows()).toHaveLength(14))
    expect(within(main()).queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    expect(within(rows()[10] as HTMLElement).getAllByRole('link')[0]).toHaveFocus()
    expect(calls.map((call) => call.params.query?.cursor !== undefined)).toEqual([false, true])
  })
})

describe('the filters of the History screen', () => {
  // Only the date is held still, so that "last 7 days" means the same on every day the tests run; timers keep running.
  const holdTheDate = () => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T10:00:00.000Z') })
  afterEach(() => vi.useRealTimers())

  it('narrow the list to one document, say so on the chip, and keep the choice in the address', async () => {
    const { user, router } = renderScreen('/history')
    await findRow(newestSentences[0])

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
    await findRow(newestSentences[0])

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

    await findRow('Daniel Okafor created “Notas de la revisión de diseño”')
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

    expect(await findRow(newestSentences[0])).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    // The button went with the filters: the focus stays among them.
    expect(chip('Document')).toHaveFocus()
  })

  it('are a group with a name, one chip each, and a menu that offers every choice and the way to take it off', async () => {
    const { user } = renderScreen('/history')
    await findRow(newestSentences[0])

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
    await findRow(newestSentences[0])

    await user.click(chip('Person'))
    await user.click(await screen.findByRole('menuitem', { name: "Couldn't load the list. Try again" }))
    await user.click(chip('Person'))

    expect(await screen.findByRole('menuitemradio', { name: 'Marta Ruiz' })).toBeInTheDocument()
  })
})

describe('the events of the History screen', () => {
  it('make the name of the document the way to it, inside the sentence', async () => {
    renderScreen('/history')
    const row = await findRow(newestSentences[0])

    const link = within(row).getByRole('link', { name: fixtures.launchPlan.title })
    expect(link).toHaveAttribute('href', `/documents/${fixtures.launchPlan.id}`)
    expect(row).toHaveTextContent(newestSentences[0])
  })

  it('label a change of who can open a document as Access, and no other event', async () => {
    renderScreen('/history')
    const access = await findRow('Marta Ruiz gave Daniel Okafor access to “Autumn launch plan”')

    expect(within(access).getByText('Access')).toBeInTheDocument()
    expect(within(await findRow(newestSentences[0])).queryByText('Access')).not.toBeInTheDocument()
  })

  it('label it in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/history')

    const access = await findRow('Marta Ruiz dio acceso a Daniel Okafor a «Autumn launch plan»')
    expect(within(access).getByText('Acceso')).toBeInTheDocument()
  })

  it('keep the timeline that was there while the filtered one is on its way', async () => {
    let answer: () => void = () => undefined
    const { user } = renderScreen('/history', {
      wrap: (dataSource) => ({
        ...dataSource,
        listWorkspaceActivity: (request) =>
          request?.params.query?.actorId === undefined
            ? dataSource.listWorkspaceActivity(request)
            : new Promise((resolve) => {
                answer = () => resolve(dataSource.listWorkspaceActivity(request))
              }),
      }),
    })
    await findRow(newestSentences[0])
    await user.click(chip('Person'))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Daniel Okafor' }))

    await waitFor(() => expect(main().querySelector('[aria-busy="true"]')).toBeInTheDocument())
    expect(rows()).toHaveLength(14)
    answer()

    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(main().querySelector('[aria-busy="true"]')).not.toBeInTheDocument()
  })

  it('leave the timeline when the person loses access to the document of an event', async () => {
    const { server, queryClient } = renderScreen('/history', { signedInAs: daniel.email })
    await findRow('created “Presupuesto 2027”')

    await server.connect({ signedInAs: marta.email }).removeAccess({
      params: { path: { documentId: fixtures.budget.id, userId: daniel.id } },
    })
    await queryClient.invalidateQueries()

    await waitFor(() => expect(rows().some((row) => row.textContent?.includes('Presupuesto 2027'))).toBe(false))
  })
})

describe('the weeks and days of the History screen', () => {
  // The first day of a week with events, in each language: a Sunday for `en` and a Monday for `es`, where the heading of
  // the week and the heading of the day are about the same date.
  it.each([
    ['en', '2026-10-11T12:00:00.000Z', 'Week of Oct 11', 'Sunday, October 11, 2026'],
    ['es', '2026-10-12T12:00:00.000Z', 'Semana del 12 oct', 'lunes, 12 de octubre de 2026'],
  ])(
    'name a week once, and a day under it, when events fall on the first day of the week, in %s',
    async (language, at, week, day) => {
      localStorage.setItem(localeStorageKey, language)
      renderScreen('/history', { wrap: withPages([[activityEvent(at, { type: 'thread.created' })]]) })
      await within(main()).findByRole('heading', { level: 3, name: day })

      const ids = [...main().querySelectorAll('[id]')].map((element) => element.id)
      expect(new Set(ids).size).toBe(ids.length)
      // Only the week is a region, and it is named as its heading says: the day is a heading inside it.
      expect(
        within(main())
          .getAllByRole('region')
          .map((region) => region.getAttribute('aria-labelledby')),
      ).toHaveLength(1)
      expect(within(main()).getByRole('region', { name: week })).toBeInTheDocument()
    },
  )
})

describe('the renames that follow one another in the History screen', () => {
  const minutesAfter = (minutes: number) => new Date(Date.UTC(2026, 9, 13, 8, 0) + minutes * 60_000).toISOString()
  // Newest first: Daniel renamed at 08:10 and 08:06, Marta at 08:00 and 08:04.
  const renames = [
    activityEvent(minutesAfter(10), { actor: { id: daniel.id, name: 'Daniel Okafor' } }),
    activityEvent(minutesAfter(6), { actor: { id: daniel.id, name: 'Daniel Okafor' } }),
    activityEvent(minutesAfter(4)),
    activityEvent(minutesAfter(0)),
  ]
  const sentence = '“Autumn launch plan” was renamed 4 times'
  const toggle = (row: HTMLElement) => within(row).getByRole('button', { name: 'Details' })
  /** What the button unfolds: it is always in the page, and is seen or not. */
  const people = (row: HTMLElement) => {
    const list = document.getElementById(toggle(row).getAttribute('aria-controls') ?? '')
    if (list === null) throw new Error('The button points at nothing')
    return list
  }

  it('are one row, with how many there were, and who made each and when only once it is unfolded', async () => {
    const { user } = renderScreen('/history', { wrap: withPages([renames]) })
    const row = await findRow(sentence)

    expect(rows()).toHaveLength(1)
    expect(toggle(row)).toHaveAttribute('aria-expanded', 'false')
    expect(people(row)).not.toBeVisible()

    await user.click(toggle(row))

    expect(toggle(row)).toHaveAttribute('aria-expanded', 'true')
    expect(people(row)).toBeVisible()
    expect(within(people(row)).getAllByText('Daniel Okafor')).toHaveLength(2)
    expect(within(people(row)).getAllByText('Marta Ruiz')).toHaveLength(2)
    // The button keeps the focus, so it can be pressed again to fold it.
    expect(toggle(row)).toHaveFocus()

    await user.click(toggle(row))

    expect(toggle(row)).toHaveAttribute('aria-expanded', 'false')
    expect(people(row)).not.toBeVisible()
    expect(toggle(row)).toHaveFocus()
  })

  it('unfold with the keyboard', async () => {
    const { user } = renderScreen('/history', { wrap: withPages([renames]) })
    const row = await findRow(sentence)

    toggle(row).focus()
    await user.keyboard('{Enter}')

    expect(toggle(row)).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard(' ')
    expect(toggle(row)).toHaveAttribute('aria-expanded', 'false')
  })

  it('are folded again when another filter is chosen, as what was unfolded belonged to the list it was in', async () => {
    const { user } = renderScreen('/history', { wrap: withPages([renames]) })
    const row = await findRow(sentence)
    await user.click(toggle(row))
    expect(toggle(row)).toHaveAttribute('aria-expanded', 'true')

    await user.click(chip('Person'))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Daniel Okafor' }))

    await waitFor(() => expect(chip('Person: Daniel Okafor')).toBeInTheDocument())
    expect(toggle(await findRow(sentence))).toHaveAttribute('aria-expanded', 'false')
  })

  it('put the button right after the interval, and keep the separator out of what the button is described by', async () => {
    renderScreen('/history', { wrap: withPages([renames]) })
    const button = toggle(await findRow(sentence))

    expect(button.previousElementSibling).toHaveTextContent(/renamed 4 times.*\d:\d\d/)
    expect(button).toHaveAccessibleDescription(expect.stringContaining('renamed 4 times'))
    expect(button).not.toHaveAccessibleDescription(/·/)
  })

  it('keep the name of the document as the way to it', async () => {
    renderScreen('/history', { wrap: withPages([renames]) })
    const row = await findRow(sentence)

    expect(within(row).getByRole('link', { name: 'Autumn launch plan' })).toHaveAttribute(
      'href',
      `/documents/${fixtures.launchPlan.id}`,
    )
  })

  it('are said in Spanish, with the number as a plural', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderScreen('/history', { wrap: withPages([renames]) })

    expect(await findRow('«Autumn launch plan» cambió de nombre 4 veces')).toBeInTheDocument()
  })

  it('are not folded when another event comes between them', async () => {
    const between = activityEvent(minutesAfter(5), { type: 'thread.created' })
    renderScreen('/history', {
      wrap: withPages([[renames[0], between, renames[3]].flatMap((event) => (event ? [event] : []))]),
    })

    await findRow('commented on')
    expect(rows()).toHaveLength(3)
    expect(within(main()).queryByRole('button', { name: 'Details' })).not.toBeInTheDocument()
  })

  it('are joined when "Load more" brings the rest of a burst the first page cut, and stay unfolded', async () => {
    const { user } = renderScreen('/history', { wrap: withPages([renames.slice(0, 2), renames.slice(2)]) })
    const half = await findRow('“Autumn launch plan” was renamed 2 times')
    await user.click(toggle(half))

    await user.click(within(main()).getByRole('button', { name: 'Load more' }))

    const whole = await findRow(sentence)
    expect(rows()).toHaveLength(1)
    expect(toggle(whole)).toHaveAttribute('aria-expanded', 'true')
    expect(within(people(whole)).getAllByText('Marta Ruiz')).toHaveLength(2)
  })

  it('take the focus to the burst the last page joined, when "Load more" goes away with it', async () => {
    const { user } = renderScreen('/history', { wrap: withPages([renames.slice(0, 2), renames.slice(2)]) })
    await findRow('“Autumn launch plan” was renamed 2 times')

    await user.click(within(main()).getByRole('button', { name: 'Load more' }))

    const whole = await findRow(sentence)
    await waitFor(() => expect(within(whole).getByRole('link', { name: 'Autumn launch plan' })).toHaveFocus())
  })
})

describe('"Load more" of the History screen when it fails', () => {
  const events = [activityEvent('2026-10-13T09:00:00.000Z', { type: 'thread.created' })]
  const more = [activityEvent('2026-10-12T09:00:00.000Z', { type: 'thread.created' })]

  it('keeps the timeline, says so, and gets the page when asked again', async () => {
    let refused = true
    const { user } = renderScreen('/history', { wrap: withPages([events, more], (page) => page === 1 && refused) })
    await findRow('commented on')

    await user.click(within(main()).getByRole('button', { name: 'Load more' }))

    expect(await within(main()).findByRole('alert')).toHaveTextContent("We couldn't load more events")
    expect(rows()).toHaveLength(1)
    expect(within(main()).queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    // It is the button the person pressed, so the focus is still on it and not handed to the page.
    const retry = within(main()).getByRole('button', { name: 'Try again' })
    expect(retry).toHaveFocus()

    refused = false
    await user.click(retry)

    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
    // The last page is in and the button is gone: the focus goes to the first event that arrived.
    expect(within(rows()[1] as HTMLElement).getByRole('link')).toHaveFocus()
  })

  it('shows the page being asked for on the button while it is on its way', async () => {
    let answer: () => void = () => undefined
    const { user } = renderScreen('/history', {
      wrap: (dataSource) => ({
        ...withPages([events, more])(dataSource),
        listWorkspaceActivity: (request) =>
          request?.params.query?.cursor === undefined
            ? withPages([events, more])(dataSource).listWorkspaceActivity(request)
            : new Promise((resolve) => {
                answer = () => resolve({ items: more, nextCursor: null })
              }),
      }),
    })
    await findRow('commented on')

    await user.click(within(main()).getByRole('button', { name: 'Load more' }))

    expect(within(main()).queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    expect(within(main()).getByRole('button', { name: 'Loading…' })).toHaveAttribute('aria-busy', 'true')
    answer()
    await waitFor(() => expect(rows()).toHaveLength(2))
  })
})

// The explorer of the editor layout keeps the list of the workspace's documents under the key the filter's options are read
// from. The two have to read it the same way, or whichever came second finds the other's data in a shape it cannot use.
describe('the History screen and the explorer, which share the list of documents', () => {
  const sharePath = `/documents/${fixtures.launchPlan.id}/share`
  const crashed = () => screen.queryByText(/Unexpected Application Error/i)

  it('offer the documents in the filter after the explorer has read them, and the explorer keeps working after the filter has', async () => {
    const { user, router } = renderScreen(sharePath)
    await screen.findByRole('tree')

    await act(() => router.navigate('/history'))
    await findRow(newestSentences[0])
    await user.click(chip('Document'))
    expect(await screen.findByRole('menuitemradio', { name: fixtures.launchPlan.title })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await act(() => router.navigate(sharePath))
    expect(await screen.findByRole('tree')).toBeInTheDocument()
    expect(crashed()).not.toBeInTheDocument()
  })

  it('leave the app standing when the History is opened first and a document after it', async () => {
    const { user, router } = renderScreen('/history')
    await findRow(newestSentences[0])
    await user.click(chip('Document'))
    expect(await screen.findByRole('menuitemradio', { name: fixtures.launchPlan.title })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await act(() => router.navigate(sharePath))

    expect(await screen.findByRole('tree')).toBeInTheDocument()
    expect(crashed()).not.toBeInTheDocument()
    // In the folder and among the recent ones: the explorer reads the list the filter read, and has the documents.
    expect(await screen.findAllByRole('treeitem', { name: new RegExp(fixtures.launchPlan.title) })).not.toHaveLength(0)
  })
})

describe('the History screen with the calls it makes', () => {
  it('asks for the history of the workspace once, with no filter, when nothing is chosen', async () => {
    const calls: Calls = []
    renderScreen('/history', { wrap: watchingHistory(calls) })
    await findRow(newestSentences[0])

    expect(calls.map((call) => call.params.query)).toEqual([{}])
  })
})
