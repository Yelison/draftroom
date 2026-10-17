import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { documentName } from '@draftroom/contract/collab'
import { launchPlan, launchPlanVersions, openVersions, rows, unavailable } from './testing/openVersions.tsx'

const preview = () => screen.getByRole('region', { name: 'Preview' })
const textOf = (name: string) => screen.findByRole('document', { name })

describe('the preview of a version', () => {
  it('asks the person to choose one before anything is shown', async () => {
    await openVersions()

    expect(within(preview()).getByText('Choose a version')).toBeInTheDocument()
  })

  it('shows what the version held, as text that cannot be edited', async () => {
    const { user } = await openVersions()

    await user.click(within(rows()[1]!).getByRole('button', { name: launchPlanVersions.named }))

    const text = await textOf('Text of “Before the pricing review”')
    expect(text).toHaveTextContent('The launch moves to the second week of November.')
    expect(text).toHaveAttribute('contenteditable', 'false')
    expect(within(preview()).getByText(/Nothing you do here changes the document/)).toBeInTheDocument()
  })

  it('marks the version that is open in the list, and replaces the text when another one is chosen', async () => {
    const { user } = await openVersions()
    const oldest = within(rows()[2]!).getByRole('button', { name: launchPlanVersions.oldest })
    const newest = within(rows()[0]!).getByRole('button', { name: launchPlanVersions.newest })

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
      wrap: (dataSource: DataSource) => ({
        ...dataSource,
        collaboration: {
          ...dataSource.collaboration,
          webSocket: class extends dataSource.collaboration.webSocket {
            constructor(url: string) {
              sockets.push(url)
              super(url)
            }
          },
        },
      }),
    })

    await user.click(within(rows()[0]!).getByRole('button', { name: launchPlanVersions.newest }))
    await screen.findByRole('document')

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
    await user.click(within(rows()[0]!).getByRole('button', { name: launchPlanVersions.newest }))

    expect(await within(preview()).findByRole('alert')).toHaveTextContent("We couldn't open this version")
    failing = false
    await user.click(within(preview()).getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText(/Marketing prepares the announcement/)).toBeInTheDocument()
  })

  it('says it cannot show a version whose content cannot be read, and leaves the others alone', async () => {
    const { user } = await openVersions(launchPlan.id, {
      wrap: (dataSource) => ({ ...dataSource, getVersionContent: async () => new Uint8Array([1, 2, 3, 4, 5]) }),
    })

    await user.click(within(rows()[0]!).getByRole('button', { name: launchPlanVersions.newest }))

    expect(await within(preview()).findByRole('alert')).toHaveTextContent("This version can't be shown")
    expect(rows()).toHaveLength(3)
  })
})
