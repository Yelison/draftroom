import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataSource } from '../data/DataSource.ts'
import { renderScreen } from '../features/documents/testing/renderScreen.tsx'
import { localeStorageKey } from '../i18n/locale.ts'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  delete document.documentElement.dataset['editorTextSize']
})

/** A browser whose preferred languages are `languages`, which is what the app reads when nothing is stored. */
const browserSpeaking = (...languages: string[]) => vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages)

/** The account as the server holds it before the page loads: what a person saved on an earlier visit. */
const saved = (preferences: Parameters<DataSource['updateMe']>[0]['body']) => (dataSource: DataSource) => {
  void dataSource.updateMe({ body: preferences })
  return dataSource
}

describe('the language saved on the account', () => {
  it('opens the app in it on the next load, over the language of the browser', async () => {
    browserSpeaking('en-US')

    renderScreen('/trash', { wrap: saved({ locale: 'es' }) })

    expect(await screen.findByRole('heading', { level: 1, name: 'Papelera' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('es')
  })

  it('takes the place of a language this browser had chosen on its own, and is remembered for the first paint', async () => {
    browserSpeaking('en-US')
    localStorage.setItem(localeStorageKey, 'en')

    renderScreen('/trash', { wrap: saved({ locale: 'es' }) })

    expect(await screen.findByRole('heading', { level: 1, name: 'Papelera' })).toBeInTheDocument()
    expect(localStorage.getItem(localeStorageKey)).toBe('es')
  })

  it('leaves the language to the browser while the account has not chosen one', async () => {
    browserSpeaking('es-MX')

    renderScreen('/trash')

    expect(await screen.findByRole('heading', { level: 1, name: 'Papelera' })).toBeInTheDocument()
    expect(localStorage.getItem(localeStorageKey)).toBeNull()
  })
})

describe('the editor text size saved on the account', () => {
  it.each(['small', 'large'] as const)('is set on the page when it is %s', async (size) => {
    renderScreen('/trash', { wrap: saved({ editorTextSize: size }) })

    await screen.findByRole('heading', { level: 1, name: 'Trash' })
    await vi.waitFor(() => expect(document.documentElement).toHaveAttribute('data-editor-text-size', size))
  })

  it('leaves the page on the base size when it is medium', async () => {
    renderScreen('/trash')

    await screen.findByRole('heading', { level: 1, name: 'Trash' })
    expect(document.documentElement).not.toHaveAttribute('data-editor-text-size')
  })
})
