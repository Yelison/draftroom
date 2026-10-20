import { documentName } from '@draftroom/contract/collab'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import {
  automaticToggle,
  choose,
  daniel,
  launchPlan,
  launchPlanVersions,
  openVersions,
  reading,
  rows,
  sofia,
  unavailable,
  when,
} from './testing/openVersions.tsx'

const reader = () => screen.getByRole('region', { name: 'Version' })

describe('the reader of a version', () => {
  it('opens on the newest version that is shown, as text that cannot be edited', async () => {
    await openVersions()

    const text = await reading()
    expect(text).toHaveTextContent('The launch moves to the second week of November.')
    const editor = text.querySelector('.ProseMirror')
    expect(editor).toHaveAttribute('contenteditable', 'false')
    // The name is the region's alone: the text inside would be said twice with one of its own.
    expect(editor).not.toHaveAttribute('aria-label')
  })

  it('replaces the text when another version is chosen, and shows nothing of the last one', async () => {
    const { user } = await openVersions()
    await user.click(automaticToggle())

    await user.click(choose(rows()[2]!))
    expect(await screen.findByText(/The launch is planned for the first week of November/)).toBeInTheDocument()
    await user.click(choose(rows()[0]!))

    expect(await screen.findByText(/Marketing prepares the announcement/)).toBeInTheDocument()
    expect(screen.queryByText(/first week of November/)).not.toBeInTheDocument()
  })

  it('never connects to the live document, nor opens any connection at all', async () => {
    const sockets: string[] = []
    const { server } = await openVersions(launchPlan.id, {
      wrap: (dataSource: DataSource) => {
        const Socket = dataSource.collaboration.webSocket
        if (Socket === undefined) throw new Error('The mock gives the collaboration connection a socket')
        return {
          ...dataSource,
          collaboration: {
            ...dataSource.collaboration,
            // Every socket the data source is asked for is kept, whoever asks.
            webSocket: new Proxy(Socket, {
              construct(target, [url]: [string]) {
                sockets.push(url)
                const socket: unknown = Reflect.construct(target, [url])
                if (typeof socket !== 'object' || socket === null) throw new Error('A socket is an object')
                return socket
              },
            }),
          },
        }
      },
    })

    await reading()

    expect(sockets).toEqual([])
    expect(server.collaboration.connectionsTo(documentName(launchPlan.id))).toBe(0)
  })
})

describe('the bar above the text', () => {
  it('says which version is read and that reading it changes nothing', async () => {
    await openVersions()
    await reading()

    expect(
      within(reader()).getByText(`You are reading the version of ${when(launchPlanVersions.named.createdAt)}`),
    ).toBeVisible()
    expect(within(reader()).getByText('Nothing you do here changes the document.')).toBeVisible()
  })

  it('does not interrupt a screen reader: it is not a live region', async () => {
    await openVersions()
    await reading()

    expect(within(reader()).queryByRole('status')).not.toBeInTheDocument()
    expect(within(reader()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('offers the restore to an owner, once the text has been read', async () => {
    await openVersions()
    await reading()

    expect(within(reader()).getByRole('button', { name: 'Restore this version' })).toBeInTheDocument()
  })

  it.each([
    { role: 'an editor', email: daniel.email },
    { role: 'a commenter', email: sofia },
  ])('does not offer the restore to $role: the server would refuse it', async ({ email }) => {
    await openVersions(launchPlan.id, { signedInAs: email })
    await reading()

    expect(screen.queryByRole('button', { name: /Restore/ })).not.toBeInTheDocument()
    expect(within(reader()).getByText('Nothing you do here changes the document.')).toBeVisible()
  })

  it('does not offer the restore of a version while its text is on its way', async () => {
    let release = () => {}
    const waiting = new Promise<void>((resolve) => (release = resolve))
    await openVersions(launchPlan.id, {
      wrap: (dataSource) => ({
        ...dataSource,
        getVersionContent: async (request) => {
          await waiting
          return dataSource.getVersionContent(request)
        },
      }),
    })

    expect(within(reader()).getByText('Loading the version')).toBeInTheDocument()
    expect(within(reader()).getByText(/^You are reading the version of /)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Restore this version' })).not.toBeInTheDocument()
    release()

    expect(await screen.findByRole('button', { name: 'Restore this version' })).toBeInTheDocument()
  })

  it('does not offer the restore of a version that could not be opened, and offers to try again', async () => {
    let failing = true
    const { user } = await openVersions(launchPlan.id, {
      wrap: (dataSource) => ({
        ...dataSource,
        getVersionContent: async (request) => {
          if (failing) throw unavailable()
          return dataSource.getVersionContent(request)
        },
      }),
    })

    expect(await within(reader()).findByRole('alert')).toHaveTextContent("We couldn't open this version")
    expect(screen.queryByRole('button', { name: 'Restore this version' })).not.toBeInTheDocument()
    failing = false
    await user.click(within(reader()).getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText(/Pricing will be reviewed/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore this version' })).toBeInTheDocument()
  })

  it('does not offer the restore of a version whose content cannot be read, and leaves the others alone', async () => {
    await openVersions(launchPlan.id, {
      wrap: (dataSource) => ({ ...dataSource, getVersionContent: async () => new Uint8Array([1, 2, 3, 4, 5]) }),
    })

    expect(await within(reader()).findByRole('alert')).toHaveTextContent("This version can't be shown")
    expect(screen.queryByRole('button', { name: 'Restore this version' })).not.toBeInTheDocument()
    expect(rows()).toHaveLength(1)
  })
})
