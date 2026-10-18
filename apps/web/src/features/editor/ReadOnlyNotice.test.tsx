import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { budget, launchPlan, people, renderEditor } from './testing/renderEditor.tsx'

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

describe('the band of someone who may edit a document that cannot be edited', () => {
  it('keeps its two rows, with the history and the comments in the first and no toolbar, for the owner of an archived document', async () => {
    const view = renderEditor({
      before: (server) => {
        void server
          .connect({ signedInAs: people.marta })
          .archiveDocument({ params: { path: { documentId: launchPlan.id } } })
      },
    })
    await textArea()
    await screen.findByText('Sync status: Read-only')

    const [first, second, ...others] = view.container.querySelectorAll<HTMLElement>('.band .row')
    expect(others).toHaveLength(0)
    expect(within(first as HTMLElement).queryByRole('toolbar')).not.toBeInTheDocument()
    expect(within(first as HTMLElement).getByRole('button', { name: 'Version history' })).toBeInTheDocument()
    expect(await within(first as HTMLElement).findByRole('button', { name: /^Comments/ })).toBeInTheDocument()
    expect(within(second as HTMLElement).getByRole('button', { name: 'Share' })).toBeInTheDocument()
  })
})
