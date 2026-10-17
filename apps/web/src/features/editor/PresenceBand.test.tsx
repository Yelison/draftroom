import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { launchPlan, openEditor } from './testing/renderEditor.tsx'

describe('the people the mock can put in a document for a layout test', () => {
  it('are shown as four avatars and a count of the rest, with the way to the history still in the band', async () => {
    const { server } = await openEditor()

    await server.addPeople(launchPlan.id, ['Ines Varga', 'Omar Haddad', 'Lucía Ferrer', 'Tobias Lind', 'Noor Aziz'])

    const people = await screen.findByRole('list', { name: 'People in this document' })
    await waitFor(() => expect(within(people).getByText('1 more person')).toBeInTheDocument())
    expect(within(people).getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'Version history' })).toBeInTheDocument()
  })
})
