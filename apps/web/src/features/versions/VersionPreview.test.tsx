import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { documentName } from '@draftroom/contract/collab'
import { launchPlan, rowButton, openVersions, rows, unavailable } from './testing/openVersions.tsx'

const preview = () => screen.getByRole('region', { name: 'Preview' })
const textOf = (name: RegExp) => screen.findByRole('region', { name })

describe('the preview of a version', () => {
  it('asks the person to choose one before anything is shown', async () => {
    await openVersions()

    expect(within(preview()).getByText('Choose a version')).toBeInTheDocument()
  })

  it('shows what the version held, as text that cannot be edited', async () => {
    const { user } = await openVersions()

    await user.click(within(rows()[1]!).getByRole('button', { name: rowButton.named }))

    const text = await textOf(/^Text of “Before the pricing review, /)
    expect(text).toHaveTextContent('The launch moves to the second week of November.')
    const editor = text.querySelector('.ProseMirror')
    expect(editor).toHaveAttribute('contenteditable', 'false')
    // The name is the region's alone: the text inside would be said twice with one of its own.
    expect(editor).not.toHaveAttribute('aria-label')
    expect(within(preview()).getByText(/Nothing you do here changes the document/)).toBeInTheDocument()
  })

  it('marks the version that is open in the list, and replaces the text when another one is chosen', async () => {
    const { user } = await openVersions()
    const oldest = within(rows()[2]!).getByRole('button', { name: rowButton.oldest })
    const newest = within(rows()[0]!).getByRole('button', { name: rowButton.newest })

    await user.click(oldest)
    expect(await screen.findByText(/The launch is planned for the first week of November/)).toBeInTheDocument()
    expect(oldest).toHaveAttribute('aria-current', 'true')

    await user.click(newest)
    expect(await screen.findByText(/Marketing prepares the announcement/)).toBeInTheDocument()
    expect(screen.queryByText(/first week of November/)).not.toBeInTheDocument()
    expect(newest).toHaveAttribute('aria-current', 'true')
    expect(oldest).not.toHaveAttribute('aria-current')
  })

  it('never connects to the live document, nor opens any connection at all', async () => {
    const sockets: string[] = []
    const { user, server } = await openVersions(launchPlan.id, {
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

    await user.click(within(rows()[0]!).getByRole('button', { name: rowButton.newest }))
    await textOf(/^Text of /)

    expect(sockets).toEqual([])
    expect(server.collaboration.connectionsTo(documentName(launchPlan.id))).toBe(0)
  })

  it('says it could not open the version and offers to try again', async () => {
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
    await user.click(within(rows()[0]!).getByRole('button', { name: rowButton.newest }))

    expect(await within(preview()).findByRole('alert')).toHaveTextContent("We couldn't open this version")
    failing = false
    await user.click(within(preview()).getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText(/Marketing prepares the announcement/)).toBeInTheDocument()
  })

  it('says it cannot show a version whose content cannot be read, and leaves the others alone', async () => {
    const { user } = await openVersions(launchPlan.id, {
      wrap: (dataSource) => ({ ...dataSource, getVersionContent: async () => new Uint8Array([1, 2, 3, 4, 5]) }),
    })

    await user.click(within(rows()[0]!).getByRole('button', { name: rowButton.newest }))

    expect(await within(preview()).findByRole('alert')).toHaveTextContent("This version can't be shown")
    expect(rows()).toHaveLength(3)
  })
})
