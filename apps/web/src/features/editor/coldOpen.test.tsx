import { focusManager, onlineManager } from '@tanstack/react-query'
import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { copiesOf, openLocalCopy } from '../../collab/offlineCache.ts'
import type { DataSource } from '../../data/DataSource.ts'
import { ApiError, TransportError } from '../../data/errors.ts'
import { daniel, marta } from '../../data/mock/fixtures/index.ts'
import { launchPlan, renderEditor } from './testing/renderEditor.tsx'

// A person who lost access while the page was closed opens the document cold: the API answers with no document, so no
// editor is mounted and no session is made to purge what this device kept. The screen has to see that the copy goes, and
// say what the open document says (protocol section 12.4): that access was removed, and that what was never stored was not sent.

/**
 * What this device keeps of the launch plan for an account: a copy that holds something, as one the person wrote does.
 * By default it holds changes the server was never shown to store; `stored` is a copy that holds only what it stored.
 */
async function keepCopy(userId: string, { stored = false } = {}) {
  const doc = new Y.Doc()
  const copy = await openLocalCopy({ userId, workspaceId: launchPlan.workspaceId, documentId: launchPlan.id }, doc)
  doc.getText('t').insert(0, 'Written before access was removed')
  if (stored) await copy?.settle(Y.snapshot(doc))
  copy?.close()
  // The writes that were started finish: the copy does not say when they are done.
  await new Promise((resolve) => setTimeout(resolve, 20))
}

/**
 * The API refuses the document with this failure. `meAnswered` is when it has said who is signed in, as the purge waits for;
 * `holdMe` keeps that answer back until `releaseMe`, and `documentRefused` is when the refusal has been given.
 */
function refusing(failure: Error, { holdMe = false } = {}) {
  let answered: () => void = () => undefined
  let released: () => void = () => undefined
  let refused: () => void = () => undefined
  const meAnswered = new Promise<void>((resolve) => (answered = resolve))
  const meHeld = holdMe ? new Promise<void>((resolve) => (released = resolve)) : Promise.resolve()
  const documentRefused = new Promise<void>((resolve) => (refused = resolve))
  const wrap = (dataSource: DataSource): DataSource => ({
    ...dataSource,
    getMe: async (...request) => {
      await meHeld
      const me = await dataSource.getMe(...request)
      answered()
      return me
    },
    getDocument: () => {
      refused()
      return Promise.reject(failure)
    },
  })
  return { wrap, meAnswered, documentRefused, releaseMe: () => released() }
}
const refusal = (status: number, code: ApiError['code']) =>
  new ApiError({ type: 'about:blank', title: 'Refused', status, code })
const notFound = refusal(404, 'not-found')

afterEach(() => {
  act(() => {
    focusManager.setFocused(undefined)
    onlineManager.setOnline(true)
  })
})

describe('opening a document with the page closed, after access was removed', () => {
  it('says that access was removed, and that what was never stored was not sent, when the copy held it, and purges it', async () => {
    await keepCopy(marta.id)
    await keepCopy(daniel.id)

    renderEditor({ wrap: refusing(notFound).wrap })

    expect(await screen.findByRole('heading', { name: 'Your access to this document was removed' })).toBeInTheDocument()
    expect(screen.getByText("Changes that weren't stored were not sent.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Documents' })).toHaveAttribute('href', '/documents')
    expect(screen.queryByRole('heading', { name: "This document isn't available" })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Document content' })).not.toBeInTheDocument()
    await waitFor(async () => expect(await copiesOf(marta.id)).toEqual([]))
    // The copy of another account of this browser is that account's, and it is still there.
    expect(await copiesOf(daniel.id)).toHaveLength(1)
  })

  it('keeps saying it when the window is focused again or the connection comes back', async () => {
    await keepCopy(marta.id)
    renderEditor({ wrap: refusing(notFound).wrap })
    expect(await screen.findByText("Changes that weren't stored were not sent.")).toBeInTheDocument()
    await waitFor(async () => expect(await copiesOf(marta.id)).toEqual([]))

    // What makes the screen read again: the copy is gone by now, and asking what it held would find nothing.
    act(() => focusManager.setFocused(false))
    act(() => focusManager.setFocused(true))
    act(() => onlineManager.setOnline(false))
    act(() => onlineManager.setOnline(true))
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(screen.getByRole('heading', { name: 'Your access to this document was removed' })).toBeInTheDocument()
    expect(screen.getByText("Changes that weren't stored were not sent.")).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: "This document isn't available" })).not.toBeInTheDocument()
  })

  it('shows the skeleton, and neither state, while it is not known what the device kept', async () => {
    await keepCopy(marta.id)
    const { wrap, documentRefused, releaseMe } = refusing(notFound, { holdMe: true })

    renderEditor({ wrap })
    await documentRefused
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(screen.getByText('Loading document')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: "This document isn't available" })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your access to this document was removed' })).not.toBeInTheDocument()

    releaseMe()

    expect(await screen.findByRole('heading', { name: 'Your access to this document was removed' })).toBeInTheDocument()
    expect(screen.queryByText('Loading document')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: "This document isn't available" })).not.toBeInTheDocument()
  })

  it('says that access was removed and nothing of changes when the copy held only what the server stored', async () => {
    await keepCopy(marta.id, { stored: true })

    renderEditor({ wrap: refusing(notFound).wrap })

    expect(await screen.findByRole('heading', { name: 'Your access to this document was removed' })).toBeInTheDocument()
    expect(screen.queryByText("Changes that weren't stored were not sent.")).not.toBeInTheDocument()
    await waitFor(async () => expect(await copiesOf(marta.id)).toEqual([]))
  })

  it('says the document is not available when this device kept nothing of it', async () => {
    renderEditor({ wrap: refusing(notFound).wrap })

    expect(await screen.findByRole('heading', { name: "This document isn't available" })).toBeInTheDocument()
    expect(screen.getByText('It may have been deleted, or you may not have access to it.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your access to this document was removed' })).not.toBeInTheDocument()
  })

  it.each([
    { answer: 'forbids something, which is not that the person lost the document', failure: refusal(403, 'forbidden') },
    { answer: 'is unavailable', failure: refusal(503, 'unavailable') },
    { answer: 'is not reached', failure: new TransportError(null) },
    { answer: 'says the person is not signed in', failure: refusal(401, 'unauthenticated') },
    { answer: 'answers 404 with something that is not the contract', failure: new TransportError(404) },
  ])('keeps the copy when the API $answer', async ({ failure }) => {
    await keepCopy(marta.id)
    const { wrap, meAnswered } = refusing(failure)

    renderEditor({ wrap })

    expect(await screen.findByRole('heading', { name: "We couldn't open this document" })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your access to this document was removed' })).not.toBeInTheDocument()
    // The pause counts from the moment the purge could have started, which is when the person is known.
    await meAnswered
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(await copiesOf(marta.id)).toHaveLength(1)
  })
})
