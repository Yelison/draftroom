import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { renderSignedOut } from './testing/renderSignedOut.tsx'

const english = {
  locale: 'en',
  path: '/sign-in',
  headline: 'Sign in',
  tagline: 'Write, comment and share documents with the people you work with.',
  points: ['Write together in real time', 'Comment on a selected passage', 'Every version is kept'],
}
const spanish = {
  locale: 'es',
  path: '/sign-up',
  headline: 'Crea tu cuenta',
  tagline: 'Escribe, comenta y comparte documentos con las personas con las que trabajas.',
  points: ['Escribe en equipo, en tiempo real', 'Comenta sobre un fragmento', 'Se guarda cada versión'],
}

describe('what the brand column says about the product', () => {
  it.each([english, spanish])(
    'says what it is and the three things it does, in $locale, as text that is read',
    async ({ locale, path, headline, tagline, points }) => {
      localStorage.setItem(localeStorageKey, locale)
      renderSignedOut(path)
      await screen.findByRole('heading', { level: 1, name: headline })

      expect(screen.getByText('Draftroom')).toBeInTheDocument()
      expect(screen.getByText(tagline)).toBeVisible()
      // The other list of the page is the switch between the screens.
      const list = screen.getAllByRole('list').find((candidate) => within(candidate).queryByText(points[0] ?? ''))
      if (list === undefined) throw new Error('The list of what the product does is not there')
      expect(within(list).getAllByRole('listitem')).toHaveLength(3)
      for (const point of points) expect(within(list).getByText(point)).toBeInTheDocument()
      localStorage.clear()
    },
  )

  it('hides the mark and the icons from a screen reader, since the name and each point say the same in words', async () => {
    const { container } = renderSignedOut('/sign-in')
    await screen.findByRole('heading', { level: 1, name: 'Sign in' })

    expect(screen.getByText('D')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
