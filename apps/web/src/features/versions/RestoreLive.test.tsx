import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { versions } from '../../data/mock/fixtures/collaboration.ts'
import { openEditor, people } from '../editor/testing/renderEditor.tsx'

describe('restoring a version in the demo', () => {
  it('changes the text of an editor that is open on the document, as it does for everyone who has it', async () => {
    const { server, text } = await openEditor()
    expect(text).not.toHaveTextContent('first week of November')

    await server
      .connect({ signedInAs: people.marta })
      .restoreVersion({ params: { path: { versionId: versions[0]!.id } } })

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Document content' })).toHaveTextContent('first week of November'),
    )
  })
})
