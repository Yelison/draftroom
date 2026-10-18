import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { launchPlan, openEditor } from './testing/renderEditor.tsx'

const fivePeople = ['Ines Varga', 'Omar Haddad', 'Lucía Ferrer', 'Tobias Lind', 'Noor Aziz']

/** jsdom lays nothing out: the room of the zone of the people, and the width of each thing in the list, are what a test says. */
function lay({ room, each }: { room: number; each: number }) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.className.includes('people') ? room : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.tagName === 'UL' ? this.children.length * each : 0
  })
}

describe('the people the mock can put in a document for a layout test', () => {
  afterEach(() => vi.restoreAllMocks())

  it('are shown as four avatars and a count of the rest when the zone has the room, with the way to the history still in the band', async () => {
    const { server } = await openEditor()

    await server.addPeople(launchPlan.id, fivePeople)

    const people = await screen.findByRole('list', { name: 'People in this document' })
    await waitFor(() => expect(within(people).getByText('1 more person')).toBeInTheDocument())
    expect(within(people).getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'Version history' })).toBeInTheDocument()
  })

  it('are shown as fewer avatars, and the rest counted, when the zone does not have the room for four', async () => {
    // Five things of 40 px (four avatars and the count) need 200 px, and four need 160: the zone has 130, so it is two avatars
    // and the count, which is three of 40.
    lay({ room: 130, each: 40 })
    const { server } = await openEditor()

    await server.addPeople(launchPlan.id, fivePeople)

    const people = await screen.findByRole('list', { name: 'People in this document' })
    await waitFor(() => expect(within(people).getByText('3 more people')).toBeInTheDocument())
    expect(within(people).getAllByRole('listitem')).toHaveLength(3)
  })

  it('are all counted, and none drawn, when the zone has no room for even one avatar', async () => {
    lay({ room: 50, each: 40 })
    const { server } = await openEditor()

    await server.addPeople(launchPlan.id, fivePeople)

    const people = await screen.findByRole('list', { name: 'People in this document' })
    await waitFor(() => expect(within(people).getByText('5 more people')).toBeInTheDocument())
    expect(within(people).getAllByRole('listitem')).toHaveLength(1)
  })
})
