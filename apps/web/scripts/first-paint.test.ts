import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { defaultLocale, localeStorageKey, locales } from '../src/i18n/locale.ts'
import { localeScript } from '../src/i18n/localeScript.ts'
import { themeStorageKey } from '../src/theme.ts'
import { insertFirstPaintScripts } from './first-paint.ts'
import { headScripts } from './head-scripts.ts'

const template = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8')

/** The page as the browser has it once its scripts have run, before any stylesheet or module has arrived. */
function firstPaint(html: string, { stored, languages }: { stored: Record<string, string>; languages: string[] }) {
  const { window } = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    beforeParse(window) {
      for (const [key, value] of Object.entries(stored)) window.localStorage.setItem(key, value)
      Object.defineProperty(window.navigator, 'languages', { value: languages })
    },
  })
  return window.document
}

describe('the first-paint scripts', () => {
  const html = insertFirstPaintScripts(template, headScripts)

  it.each([
    {
      case: 'a stored Spanish and dark theme',
      stored: { [localeStorageKey]: 'es', [themeStorageKey]: 'dark' },
      languages: ['en-US'],
      lang: 'es',
      theme: 'dark',
    },
    { case: 'a Spanish browser with nothing stored', stored: {}, languages: ['es-ES'], lang: 'es', theme: null },
    { case: 'an unsupported browser with nothing stored', stored: {}, languages: ['fr-FR'], lang: 'en', theme: null },
    {
      case: 'the stored light theme and English',
      stored: { [localeStorageKey]: 'en', [themeStorageKey]: 'light' },
      languages: ['es'],
      lang: 'en',
      theme: 'light',
    },
    {
      case: 'a stored system theme leaves the attribute off',
      stored: { [themeStorageKey]: 'system' },
      languages: ['en'],
      lang: 'en',
      theme: null,
    },
  ])('set <html lang> and the theme with $case', ({ stored, languages, lang, theme }) => {
    const { documentElement } = firstPaint(html, { stored, languages })

    expect(documentElement.getAttribute('lang')).toBe(lang)
    expect(documentElement.getAttribute('data-theme')).toBe(theme)
  })

  it('run before the app module and before any stylesheet', () => {
    const document = firstPaint(html, { stored: {}, languages: [] })
    const inline = [...document.querySelectorAll('script:not([type])')]
    const appModule = document.querySelector('script[type="module"]')

    expect(inline).toHaveLength(headScripts.length)
    expect(appModule).not.toBeNull()
    for (const script of inline) {
      expect(script.compareDocumentPosition(appModule as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(document.querySelector('link[rel="stylesheet"]')).toBeNull()
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('<title>'))
  })

  it('use the same storage keys as the app', () => {
    const script = localeScript({ storageKey: localeStorageKey, locales, fallback: defaultLocale })

    expect(headScripts).toContain(script)
    expect(headScripts.join('')).toContain(JSON.stringify(themeStorageKey))
  })
})

describe('insertFirstPaintScripts', () => {
  it('puts the scripts right after the viewport meta, after the encoding declaration', () => {
    const result = insertFirstPaintScripts('<head><meta charset="UTF-8"><meta name="viewport" content="x"></head>', [
      'a()',
      'b()',
    ])

    expect(result).toBe(
      '<head><meta charset="UTF-8"><meta name="viewport" content="x">\n    <script>a()</script><script>b()</script></head>',
    )
  })

  it.each([
    { case: 'without a viewport meta', html: '<head></head>' },
    { case: 'with two viewport metas', html: '<meta name="viewport" content="a"><meta name="viewport" content="b">' },
  ])('refuses a template $case', ({ html }) => {
    expect(() => insertFirstPaintScripts(html, ['a()'])).toThrow('exactly one viewport meta')
  })
})
