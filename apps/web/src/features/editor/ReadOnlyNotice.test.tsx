import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { budget, people, renderEditor } from './testing/renderEditor.tsx'

const textArea = () => screen.findByRole('textbox', { name: /Document content|Contenido del documento/ })
const band = (container: HTMLElement) => container.querySelector('.band') as HTMLElement

describe('the notice a reader of a document sees', () => {
  it('tells a viewer, where an editor has the toolbar, that they can read and not change', async () => {
    const view = renderEditor({ signedInAs: people.daniel, documentId: budget.id })
    await textArea()

    expect(within(band(view.container)).getByText('You can read this document but not change it.')).toBeInTheDocument()
  })

  it('tells a commenter that they can comment but not change', async () => {
    const view = renderEditor({ signedInAs: people.sofia })
    await textArea()

    expect(
      within(band(view.container)).getByText('You can read and comment on this document but not change it.'),
    ).toBeInTheDocument()
  })

  it('says it in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    const view = renderEditor({ signedInAs: people.daniel, documentId: budget.id })
    await textArea()

    expect(
      within(band(view.container)).getByText('Puedes leer este documento, pero no modificarlo.'),
    ).toBeInTheDocument()
  })

  it('shares the first row of the band with the history and the comments, so that row is never empty without a toolbar', async () => {
    const view = renderEditor({ signedInAs: people.daniel, documentId: budget.id })
    await textArea()

    const firstRow = view.container.querySelector('.band .row') as HTMLElement
    expect(within(firstRow).getByText('You can read this document but not change it.')).toBeInTheDocument()
    expect(within(firstRow).getByRole('button', { name: 'Version history' })).toBeInTheDocument()
    expect(await within(firstRow).findByRole('button', { name: /^Comments/ })).toBeInTheDocument()
    expect(within(firstRow).queryByRole('toolbar')).not.toBeInTheDocument()
  })

  it('is not there for an editor, who has the toolbar', async () => {
    const view = renderEditor()
    await textArea()

    expect(band(view.container).querySelector('.notice')).toBeNull()
    expect(screen.queryByText(/You can read/)).not.toBeInTheDocument()
  })
})
