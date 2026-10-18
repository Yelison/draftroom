import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { simulateViewport } from '../../test/viewport.ts'
import { launchPlan, openEditor } from './testing/renderEditor.tsx'

const fivePeople = ['Ines Varga', 'Omar Haddad', 'Lucía Ferrer', 'Tobias Lind', 'Noor Aziz']

describe('the people the mock can put in a document for a layout test', () => {
  it('are shown as two avatars and a count of the rest beside the comments panel, with the way to the history still in the band', async () => {
    const { server } = await openEditor()

    await server.addPeople(launchPlan.id, fivePeople)

    const people = await screen.findByRole('list', { name: 'People in this document' })
    await waitFor(() => expect(within(people).getByText('3 more people')).toBeInTheDocument())
    expect(within(people).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Version history' })).toBeInTheDocument()
  })

  it('are shown as four avatars and a count of the rest when the panel is closed and the band has the room', async () => {
    const { server, user } = await openEditor()
    await server.addPeople(launchPlan.id, fivePeople)
    await user.click(screen.getByRole('button', { name: /^Comments/ }))

    const people = await screen.findByRole('list', { name: 'People in this document' })
    await waitFor(() => expect(within(people).getByText('1 more person')).toBeInTheDocument())
    expect(within(people).getAllByRole('listitem')).toHaveLength(5)
  })

  describe('in a window narrower than a desktop', () => {
    afterEach(() => vi.restoreAllMocks())

    it('are shown as two avatars and a count even with the panel closed, because the second row has no room for four', async () => {
      simulateViewport(640)
      // The panel starts closed in a window this narrow, and stays so.
      const { server } = await openEditor()
      await server.addPeople(launchPlan.id, fivePeople)
      expect(await screen.findByRole('button', { name: /^Comments/ })).toHaveAttribute('aria-expanded', 'false')

      const people = await screen.findByRole('list', { name: 'People in this document' })
      await waitFor(() => expect(within(people).getByText('3 more people')).toBeInTheDocument())
      expect(within(people).getAllByRole('listitem')).toHaveLength(3)
    })
  })
})
