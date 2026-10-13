import { describe, expect, it } from 'vitest'
import { defaultLocale, localeStorageKey, locales, resolveLocale } from './locale.ts'
import { localeScript } from './localeScript.ts'

/** Runs the script the way a browser would, against a stand-in for the page, and returns the `lang` it set. */
function langAfterRunning(script: string, { stored, languages }: { stored: string | null; languages: string[] }) {
  const documentElement = { lang: 'en' }
  const storage = {
    getItem: (key: string) => (key === localeStorageKey ? stored : null),
  }
  new Function('document', 'localStorage', 'navigator', script)({ documentElement }, storage, { languages })
  return documentElement.lang
}

const script = localeScript({ storageKey: localeStorageKey, locales, fallback: defaultLocale })

describe('localeScript', () => {
  const matrix = [null, 'en', 'es', 'fr', 'es-MX', '__proto__'].flatMap((stored) =>
    [[], ['en-US'], ['es-MX', 'en'], ['fr-FR', 'es'], ['fr', 'de']].map((languages) => ({ stored, languages })),
  )

  it.each(matrix)('agrees with resolveLocale for stored $stored and browser $languages', ({ stored, languages }) => {
    expect(langAfterRunning(script, { stored, languages })).toBe(resolveLocale(stored, languages))
  })

  it('reads the choice from the key it was given', () => {
    const other = localeScript({ storageKey: 'another-key', locales, fallback: defaultLocale })

    expect(langAfterRunning(other, { stored: 'es', languages: ['en'] })).toBe('en')
  })

  it('leaves the language to the browser when storage cannot be read', () => {
    const documentElement = { lang: 'en' }
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
    }

    new Function('document', 'localStorage', 'navigator', script)({ documentElement }, storage, { languages: ['es'] })

    expect(documentElement.lang).toBe('es')
  })

  it('never throws, even when the browser has no languages', () => {
    expect(() =>
      new Function('document', 'localStorage', 'navigator', script)({ documentElement: {} }, {}, {}),
    ).not.toThrow()
  })

  it('declares nothing in the global scope', () => {
    expect(script).not.toMatch(/(^|[;{}])\s*(var|function)\s/)
    expect(script.startsWith('try{const ')).toBe(true)
  })

  it('stays one script element whatever the key holds', () => {
    const hostile = localeScript({ storageKey: '</script><!--', locales, fallback: defaultLocale })

    expect(hostile).not.toContain('</script')
    expect(hostile).not.toContain('<!--')
  })
})
