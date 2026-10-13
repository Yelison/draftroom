import { describe, expect, it } from 'vitest'
import { calls } from '../testing/operationCalls.ts'
import { loadContract } from '../testing/contract.ts'
import { createHttpDataSource } from './HttpDataSource.ts'

const contract = loadContract()
const origin = 'http://app.test'

/** A data source whose transport records what it was asked for and answers the way the contract says a success looks. */
function recordingSource(status: number) {
  const requests: Request[] = []
  const source = createHttpDataSource({
    baseUrl: origin,
    csrfToken: () => 'token',
    fetch: async (request) => {
      requests.push(request)
      return status === 204 ? new Response(null, { status }) : Response.json({}, { status })
    },
  })
  return { source, requests }
}

/** `/api/documents/{documentId}/pin` as a pattern that any id fits in. */
const pathPattern = (template: string) => new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`)

// The 44 bindings are one line each, and a pair such as archive and restore has the same types, so swapping two would
// still compile. This is the check that each one asks the server for the operation it is named after.
describe('the HTTP bindings', () => {
  it.each(Object.entries(calls))('%s sends the method and path the contract gives it', async (id, call) => {
    const operation = contract.operations.find((row) => row.id === id)
    const { source, requests } = recordingSource(contract.successStatus(id))

    await call(source)

    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe(operation?.method.toUpperCase())
    expect(new URL(requests[0]?.url ?? '').pathname).toMatch(pathPattern(operation?.path ?? ''))
  })

  it('downloads a version as bytes from its content path', async () => {
    const { source, requests } = recordingSource(200)

    await source.getVersionContent({ params: { path: { versionId: 'v-1' } } })

    expect(requests[0]?.method).toBe('GET')
    expect(new URL(requests[0]?.url ?? '').pathname).toBe('/api/versions/v-1/content')
  })
})
