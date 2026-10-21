import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { budget, launchPlan, people, renderEditor } from './testing/renderEditor.tsx'

const textArea = () => screen.findByRole('textbox', { name: /Document content|Contenido del documento/ })

describe('the notice a reader of a document sees', () => {
  it('tells a viewer, where an editor has the toolbar, that they can read and not change', async () => {
    renderEditor({ signedInAs: people.daniel, documentId: budget.id })
    await textArea()

    expect(screen.getByText('You can read this document but not change it.')).toBeInTheDocument()
  })

  it('tells a commenter that they can comment but not change', async () => {
    renderEditor({ signedInAs: people.sofia })
    await textArea()

    expect(screen.getByText('You can read and comment on this document but not change it.')).toBeInTheDocument()
  })

  it('says it in Spanish when the app is in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    renderEditor({ signedInAs: people.daniel, documentId: budget.id })
    await textArea()

    expect(screen.getByText('Puedes leer este documento, pero no modificarlo.')).toBeInTheDocument()
  })

  it('stands in the bar where the toolbar would be, beside the controls of the comments, so the bar is never empty', async () => {
    renderEditor({ signedInAs: people.daniel, documentId: budget.id })
    await textArea()

    expect(screen.getByText('You can read this document but not change it.')).toBeInTheDocument()
    expect(await screen.findByRole('group', { name: 'Show comments' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Comments' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Activity' })).toBeInTheDocument()
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  })

  it('is not there for an editor, who has the toolbar', async () => {
    renderEditor()
    await textArea()

    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument()
    expect(screen.queryByText(/You can read/)).not.toBeInTheDocument()
  })
})

describe('the bar of someone who may edit a document that cannot be edited', () => {
  it('has no toolbar, and keeps the history, the comments and sharing, for the owner of an archived document', async () => {
    renderEditor({
      before: (server) => {
        void server
          .connect({ signedInAs: people.marta })
          .archiveDocument({ params: { path: { documentId: launchPlan.id } } })
      },
    })
    await textArea()
    await screen.findByText('Sync status: Read-only')

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Version history' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^Comments/ })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Show comments' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
  })
})
