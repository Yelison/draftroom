import { MAX_MESSAGE_BYTES, STORE_DEBOUNCE_MS, STORE_MAX_DEBOUNCE_MS } from '@draftroom/contract/collab'
import { afterAll, describe, expect, it } from 'vitest'
import { createDatabase } from '../db/database.ts'
import { createCollabServer } from './server.ts'
import { RETRY_DELAYS_MS } from './storeRetry.ts'
import { productionTiming } from './timing.ts'

// The numbers of protocol §3.1 and §7.2, read from the server as it is configured: a drift from the contract is found here
// and not by a client.

describe('the collaboration server as production configures it', () => {
  const database = createDatabase('postgres://nobody@127.0.0.1:1/none')
  afterAll(() => database.destroy())
  const { hocuspocus } = createCollabServer({
    config: {
      collabPort: 0,
      host: '127.0.0.1',
      allowedOrigins: [],
      devIdentity: false,
      nodeEnv: 'production',
      sessionSecret: 'a-secret-that-is-long-enough-for-a-hash',
    },
    database,
    authProvider: { authenticate: () => Promise.resolve({ status: 'unauthenticated' }) },
    log: { info: () => undefined, warn: () => undefined, error: () => undefined },
  })
  const { configuration } = hocuspocus

  it('writes a document after the debounce of the contract, and at the latest after its maximum', () => {
    expect([configuration.debounce, configuration.maxDebounce]).toEqual([STORE_DEBOUNCE_MS, STORE_MAX_DEBOUNCE_MS])
  })

  it('refuses a message above the size of the contract at the transport', () => {
    expect(configuration).toMatchObject({ websocketOptions: { maxPayload: MAX_MESSAGE_BYTES } })
  })

  it('bounds what is buffered before authentication and the documents a socket may name', () => {
    expect(configuration).toMatchObject({
      timeout: 30_000,
      maxUnauthenticatedQueueSize: 256 * 1024,
      maxUnauthenticatedQueueMessages: 64,
      maxPendingDocuments: 2,
    })
  })

  it('collects garbage, because versions are full updates and not snapshots', () => {
    expect(configuration.yDocOptions.gc).toBe(true)
  })

  it('leaves the signals to the process: Hocuspocus would exit before the shutdown waits for the writes', () => {
    expect(configuration).toMatchObject({ stopOnSignals: false })
  })

  it('retries after 1 s, 2 s, 4 s, up to 30 s, and waits 30 s for them at shutdown', () => {
    expect(productionTiming).toMatchObject({
      debounceMs: STORE_DEBOUNCE_MS,
      maxDebounceMs: STORE_MAX_DEBOUNCE_MS,
      retryDelaysMs: RETRY_DELAYS_MS,
      shutdownWaitMs: 30_000,
    })
    expect(RETRY_DELAYS_MS).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000])
  })

  it('looks for documents that are due an automatic version once a minute', () => {
    expect(productionTiming.autoVersionSweepMs).toBe(60_000)
  })
})
