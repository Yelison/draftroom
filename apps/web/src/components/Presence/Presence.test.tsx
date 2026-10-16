import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AppProviders } from '../../app/AppProviders.tsx'
import { localeStorageKey } from '../../i18n/locale.ts'
import { Presence, type PresenceEntry } from './Presence.tsx'

const person = (index: number, status: PresenceEntry['status'] = 'online'): PresenceEntry => ({
  userId: `user-${index}`,
  name: `Person ${index}`,
  tone: 'blue',
  status,
})

const inApp = (people: readonly PresenceEntry[], limit?: number) => (
  <AppProviders>
    <Presence people={people} {...(limit === undefined ? {} : { limit })} />
  </AppProviders>
)

describe('the people in a document', () => {
  it('draws nothing when nobody else is there', () => {
    const { container } = render(inApp([]))

    expect(container.querySelector('ul')).toBeNull()
  })

  it.each([
    { status: 'online', said: 'Person 1, online' },
    { status: 'away', said: 'Person 1, away' },
    { status: 'offline', said: 'Person 1, offline' },
  ] as const)('says the name and that they are $status', ({ status, said }) => {
    render(inApp([person(1, status)]))

    const list = screen.getByRole('list', { name: 'People in this document' })
    expect(within(list).getByRole('img', { name: said })).toBeInTheDocument()
  })

  it('says it in Spanish', () => {
    localStorage.setItem(localeStorageKey, 'es')
    render(inApp([person(1, 'away')]))

    expect(screen.getByRole('list', { name: 'Personas en este documento' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Person 1, ausente' })).toBeInTheDocument()
  })

  it('counts the people beyond the limit instead of hiding them', () => {
    render(
      inApp(
        [1, 2, 3, 4, 5, 6].map((index) => person(index)),
        4,
      ),
    )

    expect(screen.getAllByRole('img')).toHaveLength(4)
    expect(screen.getByText('2 more people')).toBeInTheDocument()
  })

  it('says one more person in the singular', () => {
    render(
      inApp(
        [1, 2, 3, 4, 5].map((index) => person(index)),
        4,
      ),
    )

    expect(screen.getByText('1 more person')).toBeInTheDocument()
  })

  it('shows the name of a person to the keyboard as it does to the pointer', async () => {
    const user = userEvent.setup()
    render(inApp([person(1)]))

    await user.tab()

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Person 1')
  })
})
