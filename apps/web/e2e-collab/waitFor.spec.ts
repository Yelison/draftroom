import { environment } from './environment.ts'
import { expect, test } from './fixtures.ts'
import { waitFor } from './waitFor.ts'

const { apiOrigin, appOrigin, ports } = environment

/** A port of this checkout's slot on which nothing listens in this suite: the one the development server would take. */
const unusedPort = Number(process.env.DEV_SERVER_PORT ?? 5173)

test.describe('scripts/wait-for.mjs', () => {
  test('is satisfied by a port that accepts connections and by a readiness probe that answers 2xx', async () => {
    await waitFor([`tcp://127.0.0.1:${ports.database}`, `${apiOrigin}/api/health/ready`, appOrigin], 5)
  })

  test('names the target that is not ready when the time runs out', async () => {
    await expect(waitFor([`${apiOrigin}/api/health/ready`, `tcp://127.0.0.1:${unusedPort}`], 1)).rejects.toMatchObject({
      stderr: `Not ready after 1 s: tcp://127.0.0.1:${unusedPort}\n`,
    })
  })

  test('does not take an address that answers with an error for a server that is ready', async () => {
    await expect(waitFor([`${apiOrigin}/api/this-does-not-exist`], 1)).rejects.toMatchObject({
      stderr: expect.stringContaining('Not ready after 1 s'),
    })
  })

  test('refuses a target it does not know how to wait for', async () => {
    await expect(waitFor(['ftp://example.test'], 1)).rejects.toMatchObject({
      stderr: expect.stringContaining('use tcp://host:port or an http(s) address'),
    })
  })
})
