import type { Schema } from '@draftroom/contract'
import { render, screen } from '@testing-library/react'
import { IntlProvider } from 'react-intl'
import { describe, expect, it } from 'vitest'
import en from '../../i18n/en.json'
import es from '../../i18n/es.json'
import { Permission } from './Permission.tsx'

const roles: { role: Schema<'DocumentRole'>; english: string; spanish: string }[] = [
  { role: 'viewer', english: 'Viewer', spanish: 'Lector' },
  { role: 'commenter', english: 'Commenter', spanish: 'Comentarista' },
  { role: 'editor', english: 'Editor', spanish: 'Editor' },
  { role: 'owner', english: 'Owner', spanish: 'Propietario' },
]

describe('Permission', () => {
  it.each(roles)('names the $role role in English as "$english"', ({ role, english }) => {
    render(
      <IntlProvider locale="en" messages={en}>
        <Permission role={role} />
      </IntlProvider>,
    )

    expect(screen.getByText(english)).toHaveAttribute('data-role', role)
  })

  it.each(roles)('names the $role role in Spanish as "$spanish"', ({ role, spanish }) => {
    render(
      <IntlProvider locale="es" messages={es}>
        <Permission role={role} />
      </IntlProvider>,
    )

    expect(screen.getByText(spanish)).toBeInTheDocument()
  })
})
