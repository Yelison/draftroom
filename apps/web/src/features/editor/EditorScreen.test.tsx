import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, TransportError } from '../../data/errors.ts'
import { localeStorageKey } from '../../i18n/locale.ts'
import { budget, launchPlan, people, renderEditor } from './testing/renderEditor.tsx'

const textArea = () => screen.findByRole('textbox', { name: /Document content|Contenido del documento/ })

describe('the document screen', () => {
  it('opens a document for its owner with the title, the toolbar and a text area that can be edited', async () => {
    renderEditor()

    const text = await textArea()
    expect(screen.getByRole('textbox', { name: 'Document title' })).toHaveValue('Autumn launch plan')
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument()
    expect(text).toHaveAttribute('contenteditable', 'true')
    expect(text).toHaveAttribute('aria-readonly', 'false')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Autumn launch plan')
    expect(document.title).toBe('Autumn launch plan · Draftroom')
  })

  it('opens in the compact layout, with Documents as the current section', async () => {
    renderEditor()
    await textArea()

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toHaveClass('compact')
    expect(screen.getAllByRole('link', { current: 'page' }).map((link) => link.textContent)).toEqual(['Documents'])
  })

  it('shows a skeleton with a spoken status while the document is on its way, under the headline the page already has', async () => {
    let arrive: (() => void) | undefined
    renderEditor({
      wrap: (dataSource) => ({
        ...dataSource,
        getDocument: (request) => new Promise((resolve) => (arrive = () => resolve(dataSource.getDocument(request)))),
      }),
    })

    // The headline comes with the screen; the skeleton before it is the router's, while the screen's chunk is on its way.
    expect(await screen.findByRole('heading', { level: 1, name: 'Document' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading document')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    await act(async () => arrive?.())
    expect(await textArea()).toBeInTheDocument()
  })

  it('keeps the same headline element when the document arrives, so the focus that was put on it stays', async () => {
    let arrive: (() => void) | undefined
    renderEditor({
      wrap: (dataSource) => ({
        ...dataSource,
        getDocument: (request) => new Promise((resolve) => (arrive = () => resolve(dataSource.getDocument(request)))),
      }),
    })
    const headline = await screen.findByRole('heading', { level: 1 })
    headline.focus()

    await act(async () => arrive?.())
    await textArea()

    expect(screen.getByRole('heading', { level: 1 })).toBe(headline)
    expect(headline).toHaveFocus()
  })
})

describe('a document that is not there', () => {
  it('says it is not available, with a way back, and shows no editor', async () => {
    renderEditor({ documentId: '00000000-0000-4000-8000-0000000000ff' })

    const headline = await screen.findByRole('heading', { level: 1, name: "This document isn't available" })
    expect(screen.getByText('It may have been deleted, or you may not have access to it.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Documents' })).toHaveAttribute('href', '/documents')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(document.title).toBe("This document isn't available · Draftroom")
    expect(headline).toBeVisible()
  })

  it('does not tell a document that is gone from one the person cannot read', async () => {
    // Daniel is not in the workspace of the other fixtures' documents, and a stranger gets the same answer as for a missing id.
    renderEditor({ signedInAs: people.daniel, documentId: '00000000-0000-4000-8000-0000000000ff' })

    expect(await screen.findByRole('heading', { level: 1, name: "This document isn't available" })).toBeInTheDocument()
  })

  it('is written in Spanish when the person uses Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderEditor({ documentId: '00000000-0000-4000-8000-0000000000ff' })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Este documento no está disponible' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a Documentos' })).toBeInTheDocument()
    expect(document.title).toBe('Este documento no está disponible · Draftroom')
  })
})

describe('a document that could not be opened', () => {
  const failing =
    (failures: number) =>
    (dataSource: Parameters<NonNullable<Parameters<typeof renderEditor>[0]>['wrap'] & object>[0]) => {
      let calls = 0
      return {
        ...dataSource,
        getDocument: vi.fn(async (request: Parameters<typeof dataSource.getDocument>[0]) => {
          calls += 1
          if (calls <= failures) {
            throw new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })
          }
          return dataSource.getDocument(request)
        }),
      }
    }

  it('says so and offers to try again, which opens the document and puts the focus on the headline', async () => {
    const { container } = renderEditor({ wrap: failing(1) })

    expect(await screen.findByRole('heading', { level: 1, name: "We couldn't open this document" })).toBeInTheDocument()
    expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Try again' })
    expect(container).not.toContainElement(screen.queryByRole('textbox'))

    retry.focus()
    await act(async () => retry.click())

    expect(await textArea()).toBeInTheDocument()
    expect(document.activeElement).not.toBe(document.body)
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })

  it('stays on its message, with the button busy, while the retry runs, and goes back to it when the retry fails too', async () => {
    renderEditor({ wrap: failing(2) })
    await screen.findByRole('heading', { level: 1, name: "We couldn't open this document" })

    await act(async () => screen.getByRole('button', { name: 'Try again' }).click())

    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).not.toHaveAttribute('aria-busy'))
    expect(screen.getByRole('heading', { level: 1, name: "We couldn't open this document" })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('tries a request that never reached the server once more before it gives up', async () => {
    const attempts = vi.fn()
    renderEditor({
      wrap: (dataSource) => ({
        ...dataSource,
        getDocument: async (request) => {
          attempts()
          if (attempts.mock.calls.length === 1) throw new TransportError(null)
          return dataSource.getDocument(request)
        },
      }),
    })

    expect(await textArea()).toBeInTheDocument()
    expect(attempts).toHaveBeenCalledTimes(2)
  })

  it('does not retry an answer of the contract: the server has spoken', async () => {
    const getDocument = vi.fn()
    renderEditor({
      wrap: (dataSource) => ({
        ...dataSource,
        getDocument: async () => {
          getDocument()
          throw new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' })
        },
      }),
    })

    await screen.findByRole('heading', { level: 1, name: "We couldn't open this document" })
    expect(getDocument).toHaveBeenCalledTimes(1)
  })
})

describe('who may edit', () => {
  it('gives an editor the toolbar and an editable title', async () => {
    renderEditor({ signedInAs: people.daniel })

    expect(await textArea()).toHaveAttribute('contenteditable', 'true')
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Document title' })).not.toHaveAttribute('readonly')
  })

  it('gives a viewer no toolbar, a title and a text area that cannot be changed', async () => {
    renderEditor({ signedInAs: people.daniel, documentId: budget.id })

    const text = await textArea()
    expect(text).toHaveAttribute('contenteditable', 'false')
    expect(text).toHaveAttribute('aria-readonly', 'true')
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Document title' })).toHaveAttribute('readonly')
  })

  it('does not let a commenter edit the content either', async () => {
    renderEditor({ signedInAs: people.sofia })

    const text = await textArea()
    expect(text).toHaveAttribute('contenteditable', 'false')
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Document title' })).toHaveAttribute('readonly')
  })

  it('keeps the reader in the same layout as the editor: the toolbar band is there, empty', async () => {
    const editor = renderEditor()
    await textArea()
    const editorBand = editor.container.querySelector('.toolbarBand')
    editor.unmount()

    const reader = renderEditor({ signedInAs: people.sofia })
    await textArea()
    const readerBand = reader.container.querySelector('.toolbarBand')

    expect(readerBand).not.toBeNull()
    expect(editorBand).not.toBeNull()
    expect(within(readerBand as HTMLElement).queryByRole('toolbar')).not.toBeInTheDocument()
  })
})

describe('the Yjs document of an open document', () => {
  it('is destroyed when the document is left', async () => {
    const destroyed = vi.fn()
    const { Doc } = await import('yjs')
    const destroy = vi.spyOn(Doc.prototype, 'destroy').mockImplementation(function (this: InstanceType<typeof Doc>) {
      destroyed()
    })
    const view = renderEditor()
    await textArea()
    const before = destroyed.mock.calls.length

    view.unmount()

    expect(destroyed.mock.calls.length).toBeGreaterThan(before)
    destroy.mockRestore()
  })
})

describe('the title of the tab and the language of the toolbar', () => {
  it.each([
    ['en', 'Bold', 'Autumn launch plan · Draftroom'],
    ['es', 'Negrita', 'Autumn launch plan · Draftroom'],
  ])('is in %s', async (locale, boldName, tabTitle) => {
    localStorage.setItem(localeStorageKey, locale)
    renderEditor({ documentId: launchPlan.id })
    await textArea()

    expect(screen.getByRole('button', { name: boldName })).toBeInTheDocument()
    expect(document.title).toBe(tabTitle)
  })
})
