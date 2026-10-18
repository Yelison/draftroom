import { createIntl } from 'react-intl'
import { describe, expect, it } from 'vitest'
import { formatActions } from '../features/editor/formatActions.ts'
import { kindSelector } from '../features/versions/kinds.ts'
import type { Locale } from './locale.ts'
import { messages, type MessageId } from './messages.ts'

/**
 * Phrases whose wording depends on a code, such as the role someone was given, are written whole for each code, so a
 * language can agree the words around it. The caller passes the code, never another translation: a sentence built from
 * two translations cannot be right in a language that inflects.
 */
const intlFor = (locale: Locale) => createIntl({ locale, messages: messages[locale] })

const locales = ['en', 'es'] as const

describe('a role given to someone, announced', () => {
  const sentences = {
    en: {
      viewer: 'Ana was given the role Viewer.',
      commenter: 'Ana was given the role Commenter.',
      editor: 'Ana was given the role Editor.',
      owner: 'Ana was given the role Owner.',
    },
    es: {
      viewer: 'Ana recibió el rol de lector.',
      commenter: 'Ana recibió el rol de comentarista.',
      editor: 'Ana recibió el rol de editor.',
      owner: 'Ana recibió el rol de propietario.',
    },
  }

  it.each(
    locales.flatMap((locale) => Object.entries(sentences[locale]).map(([role, text]) => ({ locale, role, text }))),
  )('says it in $locale for $role', ({ locale, role, text }) => {
    expect(intlFor(locale).formatMessage({ id: 'sharing.announce.added' }, { name: 'Ana', role })).toBe(text)
  })
})

describe('the general access of a document, announced', () => {
  const sentences = {
    en: {
      none: 'General access: Only the people above.',
      viewer: 'General access: Can view.',
      commenter: 'General access: Can comment.',
      editor: 'General access: Can edit.',
    },
    es: {
      none: 'Acceso general: solo las personas de arriba.',
      viewer: 'Acceso general: pueden ver.',
      commenter: 'Acceso general: pueden comentar.',
      editor: 'Acceso general: pueden editar.',
    },
  }

  it.each(
    locales.flatMap((locale) => Object.entries(sentences[locale]).map(([access, text]) => ({ locale, access, text }))),
  )('says it in $locale for $access', ({ locale, access, text }) => {
    expect(intlFor(locale).formatMessage({ id: 'sharing.announce.general' }, { access })).toBe(text)
  })
})

describe('a version that has no name', () => {
  const sentences = {
    en: {
      auto: 'Automatic version from Oct 6',
      manual: 'Saved version from Oct 6',
      'pre-restore': 'Version before a restore from Oct 6',
      restore: 'Restored version from Oct 6',
    },
    es: {
      auto: 'Versión automática del 6 oct',
      manual: 'Versión guardada del 6 oct',
      'pre-restore': 'Versión previa a una restauración del 6 oct',
      restore: 'Versión restaurada del 6 oct',
    },
  } as const

  it.each(
    locales.flatMap((locale) =>
      (Object.keys(kindSelector) as (keyof typeof kindSelector)[]).map((kind) => ({
        locale,
        kind,
        text: sentences[locale][kind],
      })),
    ),
  )('is called by its kind and date in $locale: $kind', ({ locale, kind, text }) => {
    const sentence = intlFor(locale).formatMessage(
      { id: 'versions.unnamed' },
      { kind: kindSelector[kind], date: locale === 'en' ? 'Oct 6' : '6 oct' },
    )

    expect(sentence).toBe(text)
  })
})

describe('the tooltip of a formatting button', () => {
  const names = {
    en: {
      bold: 'Bold',
      italic: 'Italic',
      code: 'Code',
      heading2: 'Heading 2',
      heading3: 'Heading 3',
      bulletList: 'Bulleted list',
      orderedList: 'Numbered list',
      link: 'Link',
    },
    es: {
      bold: 'Negrita',
      italic: 'Cursiva',
      code: 'Código',
      heading2: 'Encabezado 2',
      heading3: 'Encabezado 3',
      bulletList: 'Lista con viñetas',
      orderedList: 'Lista numerada',
      link: 'Enlace',
    },
  }

  it.each(locales.flatMap((locale) => formatActions.map(({ id }) => ({ locale, id, name: names[locale][id] }))))(
    'names $id and its shortcut in $locale',
    ({ locale, id, name }) => {
      expect(intlFor(locale).formatMessage({ id: 'editor.toolbar.tooltip' }, { action: id, shortcut: 'Ctrl+B' })).toBe(
        `${name} (Ctrl+B)`,
      )
    },
  )
})

describe('the sync status, announced', () => {
  const sentences = {
    en: {
      connecting: 'Sync status: Connecting',
      synchronising: 'Sync status: Synchronising',
      synced: 'Sync status: Synced',
      offlineLocal: 'Sync status: Offline with local copy',
      offlineTab: 'Sync status: Offline, no local copy',
      reconnecting: 'Sync status: Reconnecting',
      error: 'Sync status: Error',
      revoked: 'Sync status: Access removed',
      readOnly: 'Sync status: Read-only',
    },
    es: {
      connecting: 'Estado de la sincronización: Conectando',
      synchronising: 'Estado de la sincronización: Sincronizando',
      synced: 'Estado de la sincronización: Sincronizado',
      offlineLocal: 'Estado de la sincronización: Sin conexión, con copia local',
      offlineTab: 'Estado de la sincronización: Sin conexión, sin copia local',
      reconnecting: 'Estado de la sincronización: Reconectando',
      error: 'Estado de la sincronización: Error',
      revoked: 'Estado de la sincronización: Acceso retirado',
      readOnly: 'Estado de la sincronización: Solo lectura',
    },
  }

  it.each(
    locales.flatMap((locale) => Object.entries(sentences[locale]).map(([status, text]) => ({ locale, status, text }))),
  )('says $status in $locale', ({ locale, status, text }) => {
    expect(intlFor(locale).formatMessage({ id: 'sync.announcement' }, { status })).toBe(text)
  })
})

describe('the words a phrase chooses by code', () => {
  // The branches repeat words that are also in a message of their own (the visible name of a button, the label of the pill),
  // so the two can drift apart. What a sighted person reads and what is announced or shown in the tooltip must be the same.
  const syncLabels = {
    connecting: 'connecting',
    synchronising: 'synchronising',
    synced: 'synced',
    offlineLocal: 'offline-local',
    offlineTab: 'offline-tab',
    reconnecting: 'reconnecting',
    error: 'error',
    revoked: 'revoked',
    readOnly: 'read-only',
  } as const

  it.each(locales.flatMap((locale) => formatActions.map(({ id, name }) => ({ locale, id, name }))))(
    'names $id in the tooltip as the button does, in $locale',
    ({ locale, id, name }) => {
      const intl = intlFor(locale)

      const tooltip = intl.formatMessage({ id: 'editor.toolbar.tooltip' }, { action: id, shortcut: 'Ctrl+B' })

      expect(tooltip).toBe(`${intl.formatMessage({ id: name })} (Ctrl+B)`)
    },
  )

  it.each(
    locales.flatMap((locale) => Object.entries(syncLabels).map(([selector, label]) => ({ locale, selector, label }))),
  )('announces $selector with the words of the pill, in $locale', ({ locale, selector, label }) => {
    const intl = intlFor(locale)

    const announcement = intl.formatMessage({ id: 'sync.announcement' }, { status: selector })

    expect(announcement.endsWith(`: ${intl.formatMessage({ id: `sync.state.${label}` as MessageId })}`)).toBe(true)
  })
})
