import { contractLimits } from '@draftroom/contract'
import { createIntl } from 'react-intl'
import { describe, expect, it } from 'vitest'
import { messages } from '../../i18n/messages.ts'
import { copyTitle } from './copyTitle.ts'

const intl = (locale: 'en' | 'es') => createIntl({ locale, messages: messages[locale] })
const codePoints = (text: string) => [...text].length

describe('the title of a copy', () => {
  it.each([
    ['en', 'Autumn launch plan', 'Copy of “Autumn launch plan”'],
    ['es', 'Plan de lanzamiento', 'Copia de «Plan de lanzamiento»'],
  ] as const)('is written in the language of the person (%s)', (locale, title, expected) => {
    expect(copyTitle(intl(locale), title)).toBe(expected)
  })

  it.each(['en', 'es'] as const)(
    'keeps a long title inside the limit of the contract and keeps its closing quote (%s)',
    (locale) => {
      const copy = copyTitle(intl(locale), 'a'.repeat(200))

      expect(codePoints(copy)).toBe(contractLimits.documentTitle.max)
      expect(copy).toMatch(locale === 'en' ? /^Copy of “a+”$/ : /^Copia de «a+»$/)
    },
  )

  it('cuts in code points, never through an emoji, which is two UTF-16 units', () => {
    const copy = copyTitle(intl('en'), '🌊'.repeat(200))

    expect(codePoints(copy)).toBe(contractLimits.documentTitle.max)
    expect(copy).toBe(`Copy of “${'🌊'.repeat(200 - codePoints('Copy of “”'))}”`)
    expect(copy.length).toBeGreaterThan(contractLimits.documentTitle.max)
  })

  it('does not cut a title that fits', () => {
    const title = '🌊'.repeat(100)

    expect(copyTitle(intl('en'), title)).toBe(`Copy of “${title}”`)
  })
})
