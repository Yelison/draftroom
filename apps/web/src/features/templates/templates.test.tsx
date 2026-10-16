import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AppProviders } from '../../app/AppProviders.tsx'
import { DataSourceContext } from '../../data/DataSourceContext.ts'
import { createMockDataSource } from '../../data/mock/createMockDataSource.ts'
import { LanguageChoice } from '../preferences/LanguageChoice.tsx'
import { TemplatePickerDialog } from './TemplatePickerDialog.tsx'
import type { DataSource } from '../../data/DataSource.ts'
import { ApiError } from '../../data/errors.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { renderScreen } from '../documents/testing/renderScreen.tsx'

const unavailable = () => new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })

/** Records what `createDocument` is sent, and lets it through. */
function watchCreate() {
  const bodies: unknown[] = []
  const wrap = (dataSource: DataSource): DataSource => ({
    ...dataSource,
    createDocument: (request) => {
      bodies.push(request.body)
      return dataSource.createDocument(request)
    },
  })
  return { bodies, wrap }
}

const openPicker = async (options?: Parameters<typeof renderScreen>[1]) => {
  const view = renderScreen('/documents', options)
  const trigger = await screen.findByRole('button', { name: 'From a template' })
  await view.user.click(trigger)
  return { ...view, trigger, dialog: await screen.findByRole('dialog', { name: 'Choose a template' }) }
}

describe('choosing a template', () => {
  it('lists the templates with their descriptions, each one a link to its page', async () => {
    const { dialog } = await openPicker()

    const link = await within(dialog).findByRole('link', { name: /Meeting notes/ })
    expect(link).toHaveAttribute('href', '/templates/meeting-notes')
    expect(link).toHaveTextContent('Agenda, decisions and who does what next.')
    expect(within(dialog).getAllByRole('link')).toHaveLength(3)
  })

  it('opens the page of the template that is chosen, with the keyboard', async () => {
    const { user, dialog } = await openPicker()

    const link = await within(dialog).findByRole('link', { name: /Weekly update/ })
    link.focus()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('heading', { level: 1, name: 'Weekly update' })).toBeInTheDocument()
    expect(screen.getByText('What moved this week and what is blocked.')).toBeInTheDocument()
  })

  it('names the templates in the language of the app', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    try {
      const view = renderScreen('/documents')
      await view.user.click(await screen.findByRole('button', { name: 'Desde una plantilla' }))

      const dialog = await screen.findByRole('dialog', { name: 'Elige una plantilla' })
      expect(await within(dialog).findByRole('link', { name: /Notas de reunión/ })).toBeInTheDocument()
    } finally {
      localStorage.removeItem(localeStorageKey)
    }
  })

  it('puts the focus back on its button when it is closed', async () => {
    const { user, trigger, dialog } = await openPicker()

    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('says it is loading, and then shows the templates', async () => {
    let arrive: (() => void) | undefined
    const { dialog } = await openPicker({
      wrap: (dataSource) => ({
        ...dataSource,
        listTemplates: (request) =>
          new Promise((resolve) => (arrive = () => resolve(dataSource.listTemplates(request)))),
      }),
    })

    expect(await within(dialog).findByRole('status')).toHaveTextContent('Loading templates')
    await waitFor(() => expect(arrive).toBeDefined())
    await act(async () => arrive?.())
    expect(await within(dialog).findByRole('link', { name: /Meeting notes/ })).toBeInTheDocument()
  })

  it('moves the focus from the button that closes it to the first template when they arrive', async () => {
    let arrive: (() => void) | undefined
    const { dialog } = await openPicker({
      wrap: (dataSource) => ({
        ...dataSource,
        listTemplates: (request) =>
          new Promise((resolve) => (arrive = () => resolve(dataSource.listTemplates(request)))),
      }),
    })
    await waitFor(() => expect(arrive).toBeDefined())
    // A browser puts the focus here when the dialog opens with nothing else to focus; jsdom does not.
    within(dialog).getByRole('button', { name: 'Close' }).focus()

    await act(async () => arrive?.())

    await waitFor(() => expect(within(dialog).getByRole('link', { name: /Meeting notes/ })).toHaveFocus())
  })

  it('announces a failure and offers to try again', async () => {
    let failures = 1
    const { user, dialog } = await openPicker({
      wrap: (dataSource) => ({
        ...dataSource,
        listTemplates: (request) => {
          if (failures-- > 0) return Promise.reject(unavailable())
          return dataSource.listTemplates(request)
        },
      }),
    })

    expect(await within(dialog).findByRole('alert')).toHaveTextContent("We couldn't load the templates")
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }))

    expect(await within(dialog).findByRole('link', { name: /Meeting notes/ })).toBeInTheDocument()
  })
})

describe('changing the language while the templates are on screen', () => {
  it('shows them in the new language, not the ones that were fetched for the old one', async () => {
    localStorage.removeItem(localeStorageKey)
    const user = userEvent.setup()
    try {
      render(
        <DataSourceContext value={createMockDataSource()}>
          <AppProviders>
            <MemoryRouter>
              <LanguageChoice onChange={() => undefined} />
              <TemplatePickerDialog open onClose={() => undefined} />
            </MemoryRouter>
          </AppProviders>
        </DataSourceContext>,
      )
      expect(await screen.findByRole('link', { name: /Meeting notes/ })).toBeInTheDocument()

      await user.click(screen.getByRole('radio', { name: 'Español', hidden: true }))

      expect(await screen.findByRole('link', { name: /Notas de reunión/ })).toBeInTheDocument()
    } finally {
      localStorage.removeItem(localeStorageKey)
    }
  })
})

describe('the page of a template', () => {
  it('creates the document from the template, in the language of the app, and opens it', async () => {
    const { bodies, wrap } = watchCreate()
    const { user, router } = renderScreen('/templates/meeting-notes', { wrap })

    await user.click(await screen.findByRole('button', { name: 'Use this template' }))

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/documents\/[\w-]+$/))
    expect(bodies).toEqual([{ title: 'Meeting notes', templateId: 'meeting-notes', locale: 'en' }])
  })

  it('sends the Spanish language and name when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    try {
      const { bodies, wrap } = watchCreate()
      const { user } = renderScreen('/templates/meeting-notes', { wrap })

      await user.click(await screen.findByRole('button', { name: 'Usar esta plantilla' }))

      await waitFor(() =>
        expect(bodies).toEqual([{ title: 'Notas de reunión', templateId: 'meeting-notes', locale: 'es' }]),
      )
    } finally {
      localStorage.removeItem(localeStorageKey)
    }
  })

  it('says why the document could not be created, next to the button, and stays', async () => {
    const { user, router } = renderScreen('/templates/meeting-notes', {
      wrap: (dataSource) => ({ ...dataSource, createDocument: () => Promise.reject(unavailable()) }),
    })

    await user.click(await screen.findByRole('button', { name: 'Use this template' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/templates/meeting-notes')
  })

  it('says it is loading, with room for what comes, and then shows the template', async () => {
    let arrive: (() => void) | undefined
    renderScreen('/templates/meeting-notes', {
      wrap: (dataSource) => ({
        ...dataSource,
        listTemplates: (request) =>
          new Promise((resolve) => (arrive = () => resolve(dataSource.listTemplates(request)))),
      }),
    })

    expect(await screen.findByRole('status')).toHaveTextContent('Loading templates')
    expect(screen.queryByRole('button', { name: 'Use this template' })).not.toBeInTheDocument()
    await waitFor(() => expect(arrive).toBeDefined())
    await act(async () => arrive?.())
    expect(await screen.findByRole('button', { name: 'Use this template' })).toBeInTheDocument()
  })

  it('says a template does not exist when it is not one of the built-in ones', async () => {
    renderScreen('/templates/no-such-template')

    expect(await screen.findByText("This template doesn't exist")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to documents' })).toHaveAttribute('href', '/documents')
    expect(screen.queryByRole('button', { name: 'Use this template' })).not.toBeInTheDocument()
  })

  it('announces a failure to load the template and offers to try again', async () => {
    let failures = 1
    const { user } = renderScreen('/templates/meeting-notes', {
      wrap: (dataSource) => ({
        ...dataSource,
        listTemplates: (request) =>
          failures-- > 0 ? Promise.reject(unavailable()) : dataSource.listTemplates(request),
      }),
    })

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the templates")
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('button', { name: 'Use this template' })).toBeInTheDocument()
  })
})
