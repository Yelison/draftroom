import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { copiesOf, openLocalCopy } from '../../collab/offlineCache.ts'
import type { DataSource } from '../../data/DataSource.ts'
import { ApiError, TransportError } from '../../data/errors.ts'
import { daniel, marta } from '../../data/mock/fixtures/index.ts'
import { launchPlan, renderEditor } from './testing/renderEditor.tsx'

// A person who lost access while the page was closed opens the document cold: the API answers with no document, so no
// editor is mounted and no session is made to purge what this device kept. The screen has to see that the copy goes anyway.

/** What this device keeps of the launch plan for an account: a copy that holds something, as one the person wrote does. */
async function keepCopy(userId: string) {
  const doc = new Y.Doc()
  const copy = await openLocalCopy({ userId, workspaceId: launchPlan.workspaceId, documentId: launchPlan.id }, doc)
  doc.getText('t').insert(0, 'Written before access was removed')
  copy?.close()
  // The writes that were started finish: the copy does not say when they are done.
  await new Promise((resolve) => setTimeout(resolve, 20))
}

const refusing = (failure: Error) => (dataSource: DataSource) => ({
  ...dataSource,
  getDocument: () => Promise.reject(failure),
})
const refusal = (status: number, code: ApiError['code']) =>
  new ApiError({ type: 'about:blank', title: 'Refused', status, code })

describe('opening a document with the page closed, after access was removed', () => {
  it('purges the copy of the account and says what it says of a document that is not there', async () => {
    await keepCopy(marta.id)
    await keepCopy(daniel.id)

    renderEditor({ wrap: refusing(refusal(404, 'not-found')) })

    expect(await screen.findByRole('heading', { name: "This document isn't available" })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Document content' })).not.toBeInTheDocument()
    await waitFor(async () => expect(await copiesOf(marta.id)).toEqual([]))
    // The copy of another account of this browser is that account's, and it is still there.
    expect(await copiesOf(daniel.id)).toHaveLength(1)
  })

  it.each([
    { answer: 'forbids something, which is not that the person lost the document', failure: refusal(403, 'forbidden') },
    { answer: 'is unavailable', failure: refusal(503, 'unavailable') },
    { answer: 'is not reached', failure: new TransportError(null) },
    { answer: 'says the person is not signed in', failure: refusal(401, 'unauthenticated') },
  ])('keeps the copy when the API $answer', async ({ failure }) => {
    await keepCopy(marta.id)

    renderEditor({ wrap: refusing(failure) })

    expect(await screen.findByRole('heading', { name: "We couldn't open this document" })).toBeInTheDocument()
    // The purge is made once the person is known, which is after what is on screen: give it the time it would take.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(await copiesOf(marta.id)).toHaveLength(1)
  })
})
