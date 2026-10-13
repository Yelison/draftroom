import { afterEach, describe, expect, it, vi } from 'vitest'
import { localeStorageKey, readStoredLocale, resolveLocale, storeLocale } from './locale.ts'

describe('resolveLocale', () => {
  it.each([
    { case: 'the stored choice wins over the browser', stored: 'es', browser: ['en-US'], expected: 'es' },
    { case: 'a stored English wins over a Spanish browser', stored: 'en', browser: ['es-ES'], expected: 'en' },
    { case: 'the browser decides without a choice', stored: null, browser: ['es-MX', 'en'], expected: 'es' },
    {
      case: 'the first browser language that is supported',
      stored: null,
      browser: ['fr-FR', 'es', 'en'],
      expected: 'es',
    },
    { case: 'a regional tag is its language', stored: null, browser: ['EN-gb'], expected: 'en' },
    { case: 'an unsupported browser falls back to English', stored: null, browser: ['fr-FR', 'de'], expected: 'en' },
    { case: 'no browser languages fall back to English', stored: null, browser: [], expected: 'en' },
    { case: 'an unknown stored value is ignored', stored: 'fr', browser: ['es'], expected: 'es' },
    { case: 'a stored value that is only a regional tag is ignored', stored: 'es-MX', browser: ['en'], expected: 'en' },
  ])('$case', ({ stored, browser, expected }) => {
    expect(resolveLocale(stored, browser)).toBe(expected)
  })
})

describe('the stored language', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is remembered under the key the first-paint script reads', () => {
    storeLocale('es')

    expect(localStorage.getItem(localeStorageKey)).toBe('es')
    expect(readStoredLocale()).toBe('es')
  })

  it('is null when nothing was chosen', () => {
    expect(readStoredLocale()).toBeNull()
  })

  it('is null when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(readStoredLocale()).toBeNull()
  })

  it('does not throw when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })

    expect(() => storeLocale('es')).not.toThrow()
  })
})
