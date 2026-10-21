import { focusManager } from '@tanstack/react-query'
import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, TransportError } from '../../data/errors.ts'
import type { DataSource } from '../../data/DataSource.ts'
import { launchPlan, openEditor, people, type RenderEditorOptions } from './testing/renderEditor.tsx'

const title = () => screen.getByRole('textbox', { name: 'Document title' })

/** Watches `updateDocument` without changing what it does. */
function spyOnUpdates() {
  const calls: unknown[] = []
  const wrap: NonNullable<RenderEditorOptions['wrap']> = (dataSource) => ({
    ...dataSource,
    updateDocument: (request) => {
      calls.push(request.body)
      return dataSource.updateDocument(request)
    },
  })
  return { calls, wrap }
}

describe('saving the title', () => {
  it('sends the new title with the revision the document has, when the field is left', async () => {
    const { calls, wrap } = spyOnUpdates()
    const { user } = await openEditor({ wrap })

    await user.clear(title())
    await user.type(title(), 'Winter launch plan')
    expect(calls).toEqual([])
    await user.tab()

    await waitFor(() => expect(calls).toEqual([{ title: 'Winter launch plan', revision: launchPlan.revision }]))
  })

  it('sends it when Enter is pressed too, and moves on to the text', async () => {
    const { calls, wrap } = spyOnUpdates()
    const { user, text } = await openEditor({ wrap })

    await user.clear(title())
    await user.type(title(), 'Winter launch plan{Enter}')

    await waitFor(() => expect(calls).toHaveLength(1))
    await waitFor(() => expect(text).toHaveFocus())
  })

  it('is a line of text that wraps, so a line break that is pasted into it becomes a space', async () => {
    const { user } = await openEditor()
    await user.clear(title())

    await user.click(title())
    await user.paste('Winter\nlaunch\r\n  plan')

    expect(title()).toHaveValue('Winter launch plan')
  })

  it('does not send a title that did not change, or only changed in its spaces', async () => {
    const { calls, wrap } = spyOnUpdates()
    const { user } = await openEditor({ wrap })

    await user.click(title())
    await user.type(title(), '  ')
    await user.tab()

    expect(calls).toEqual([])
    expect(title()).toHaveValue('Autumn launch plan')
  })

  it('trims the spaces around the title it sends', async () => {
    const { calls, wrap } = spyOnUpdates()
    const { user } = await openEditor({ wrap })

    await user.clear(title())
    await user.type(title(), '  Winter plan  ')
    await user.tab()

    await waitFor(() => expect(calls).toEqual([{ title: 'Winter plan', revision: launchPlan.revision }]))
  })

  it('sends the revision of the last answer in the next save, so two saves in a row never collide', async () => {
    const { calls, wrap } = spyOnUpdates()
    const { user } = await openEditor({ wrap })

    await user.clear(title())
    await user.type(title(), 'One')
    await user.tab()
    await waitFor(() => expect(calls).toHaveLength(1))
    await waitFor(() => expect(title()).toHaveValue('One'))
    await user.clear(title())
    await user.type(title(), 'Two')
    await user.tab()

    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls).toEqual([
      { title: 'One', revision: launchPlan.revision },
      { title: 'Two', revision: launchPlan.revision + 1 },
    ])
  })

  it('queues a save made while another is still on its way, and sends it with the revision the first one made', async () => {
    const calls: unknown[] = []
    let release: (() => void) | undefined
    const { user } = await openEditor({
      wrap: (dataSource) => ({
        ...dataSource,
        updateDocument: async (request) => {
          calls.push(request.body)
          if (calls.length === 1) await new Promise<void>((resolve) => (release = resolve))
          return dataSource.updateDocument(request)
        },
      }),
    })

    await user.clear(title())
    await user.type(title(), 'One')
    await user.tab()
    await waitFor(() => expect(calls).toHaveLength(1))
    await user.click(title())
    await user.type(title(), ' and two')
    await user.tab()
    expect(calls).toHaveLength(1)
    release?.()

    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls).toEqual([
      { title: 'One', revision: launchPlan.revision },
      { title: 'One and two', revision: launchPlan.revision + 1 },
    ])
  })

  it('says nothing about being saved: the server stored it or it did not, and the title is just the title', async () => {
    const { user } = await openEditor()

    await user.clear(title())
    await user.type(title(), 'Winter plan')
    await user.tab()
    await waitFor(() => expect(title()).toHaveValue('Winter plan'))

    expect(screen.queryByText(/saved|guardad/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('follows a title that someone else changed, while the person has typed nothing', async () => {
    const { server } = await openEditor()
    const daniel = server.connect({ signedInAs: people.daniel })
    expect(title()).toHaveValue('Autumn launch plan')

    await daniel.updateDocument({
      params: { path: { documentId: launchPlan.id } },
      body: { title: 'Renamed by Daniel', revision: launchPlan.revision },
    })
    // The query is read again when the window gets the focus back, which is how the app learns of changes until the
    // collaboration connection brings them.
    act(() => focusManager.setFocused(false))
    act(() => focusManager.setFocused(true))

    await waitFor(() => expect(title()).toHaveValue('Renamed by Daniel'))
  })
})

describe('a title that is not a title', () => {
  it('asks for one when it is emptied, announces it, keeps the field and sends nothing', async () => {
    const { calls, wrap } = spyOnUpdates()
    const { user } = await openEditor({ wrap })

    await user.clear(title())
    await user.tab()

    expect(await screen.findByRole('alert')).toHaveTextContent('Give the document a title.')
    expect(title()).toBeInvalid()
    expect(title()).toHaveAccessibleDescription('Give the document a title.')
    expect(title()).toHaveValue('')
    expect(calls).toEqual([])
  })

  it('does not move on to the text while the title is empty', async () => {
    const { user, text } = await openEditor()

    await user.clear(title())
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    // Moving into the text is done on the next animation frame, so it is given one before it is looked for.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(title()).toHaveFocus()
    expect(text).not.toHaveFocus()
  })

  it('clears the message as soon as the person types again', async () => {
    const { user } = await openEditor()
    await user.clear(title())
    await user.tab()
    await screen.findByRole('alert')

    await user.click(title())
    await user.type(title(), 'A')

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})

describe('the length of the title', () => {
  const limit = 200

  it('keeps what fits in 200 code points and says the limit, when more is pasted', async () => {
    const { user } = await openEditor()
    await user.clear(title())

    await user.click(title())
    await user.paste('a'.repeat(limit + 25))

    expect([...(title() as HTMLInputElement).value]).toHaveLength(limit)
    expect(await screen.findByRole('alert')).toHaveTextContent('A title can have up to 200 characters.')
  })

  it('counts code points as the contract does: 200 emoji, which are 400 UTF-16 units, fit whole', async () => {
    const { calls, wrap } = spyOnUpdates()
    const { user } = await openEditor({ wrap })
    const emoji = '😀'.repeat(limit)
    await user.clear(title())

    await user.click(title())
    await user.paste(emoji)
    await user.tab()

    expect((title() as HTMLInputElement).value).toBe(emoji)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await waitFor(() => expect(calls).toEqual([{ title: emoji, revision: launchPlan.revision }]))
  })

  it('cuts at a code point, never in the middle of an emoji', async () => {
    const { user } = await openEditor()
    await user.clear(title())

    await user.click(title())
    await user.paste('😀'.repeat(limit + 1))

    expect((title() as HTMLInputElement).value).toBe('😀'.repeat(limit))
  })

  it('does not rely on the maxlength attribute, which counts UTF-16 units', async () => {
    await openEditor()

    expect(title()).not.toHaveAttribute('maxlength')
  })
})

describe('when someone else changed the title first', () => {
  it("keeps what the person wrote, puts the server's document in the cache and says so", async () => {
    const { server, user } = await openEditor()
    const daniel = server.connect({ signedInAs: people.daniel })
    await daniel.updateDocument({
      params: { path: { documentId: launchPlan.id } },
      body: { title: 'Renamed by Daniel', revision: launchPlan.revision },
    })

    await user.clear(title())
    await user.type(title(), 'My own title')
    await user.tab()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Someone else changed the title. Your text is still here; press Enter to use it instead.',
    )
    expect(title()).toHaveValue('My own title')
    expect(title()).toBeInvalid()
  })

  it('saves what the person wrote on the next Enter, now with the revision the server has', async () => {
    const calls: unknown[] = []
    const { server, user } = await openEditor({
      wrap: (dataSource) => ({
        ...dataSource,
        updateDocument: (request) => {
          calls.push(request.body)
          return dataSource.updateDocument(request)
        },
      }),
    })
    const daniel = server.connect({ signedInAs: people.daniel })
    await daniel.updateDocument({
      params: { path: { documentId: launchPlan.id } },
      body: { title: 'Renamed by Daniel', revision: launchPlan.revision },
    })
    await user.clear(title())
    await user.type(title(), 'My own title')
    await user.tab()
    await screen.findByRole('alert')

    await user.click(title())
    await user.keyboard('{Enter}')

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(calls).toEqual([
      { title: 'My own title', revision: launchPlan.revision },
      { title: 'My own title', revision: launchPlan.revision + 1 },
    ])
    expect(title()).toHaveValue('My own title')
  })

  it('has nothing left to say when the other title is the one that was typed', async () => {
    const { server, user } = await openEditor()
    const daniel = server.connect({ signedInAs: people.daniel })
    await daniel.updateDocument({
      params: { path: { documentId: launchPlan.id } },
      body: { title: 'Same title', revision: launchPlan.revision },
    })

    await user.clear(title())
    await user.type(title(), 'Same title')
    await user.tab()

    await waitFor(() => expect(title()).toHaveValue('Same title'))
  })
})

describe('when the title could not be saved', () => {
  const failOnce = (failure: Error) => {
    let failed = false
    return (dataSource: DataSource): DataSource => ({
      ...dataSource,
      updateDocument: vi.fn(async (request) => {
        if (!failed) {
          failed = true
          throw failure
        }
        return dataSource.updateDocument(request)
      }),
    })
  }

  it.each([
    ['the request did not arrive', new TransportError(null)],
    [
      'the server was down',
      new ApiError({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'unavailable' }),
    ],
  ])('says so and keeps the text when %s, and the next Enter tries again', async (_case, failure) => {
    const { user } = await openEditor({ wrap: failOnce(failure) })

    await user.clear(title())
    await user.type(title(), 'Winter plan')
    await user.tab()

    expect(await screen.findByRole('alert')).toHaveTextContent("The title couldn't be changed. Try again.")
    expect(title()).toHaveValue('Winter plan')

    await user.click(title())
    await user.keyboard('{Enter}')

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(title()).toHaveValue('Winter plan')
  })

  it('reads the document again when the server says the person may no longer rename it', async () => {
    const getDocument = vi.fn()
    const { user } = await openEditor({
      wrap: (dataSource) => ({
        ...dataSource,
        getDocument: (request) => {
          getDocument()
          return dataSource.getDocument(request)
        },
        updateDocument: async () => {
          throw new ApiError({ type: 'about:blank', title: 'Forbidden', status: 403, code: 'forbidden' })
        },
      }),
    })
    await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(1))

    await user.clear(title())
    await user.type(title(), 'Winter plan')
    await user.tab()

    await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
