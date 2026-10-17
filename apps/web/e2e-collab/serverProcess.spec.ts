import { environment } from './environment.ts'
import { expect, test } from './fixtures.ts'
import { ServerProcess } from './serverProcess.ts'

test.describe('the server process of the suite', () => {
  test('refuses to start while another server already answers on its ports, and leaves that one running', async ({
    server,
  }) => {
    expect(server.running).toBe(true)

    await expect(new ServerProcess().start()).rejects.toThrow(/Port \d+ already accepts connections/)

    const ready = await fetch(`${environment.apiOrigin}/api/health/ready`)
    expect(ready.status).toBe(200)
  })

  test('answers on its ports after a start, and on none once it was killed', async ({ server }) => {
    await server.stop('SIGKILL')
    await expect(fetch(`${environment.apiOrigin}/api/health/ready`)).rejects.toThrow()

    await server.start()

    expect((await fetch(`${environment.apiOrigin}/api/health/ready`)).status).toBe(200)
  })

  test('reports at once a server that dies before it answers, instead of waiting for its ports', async ({ server }) => {
    await server.stop('SIGKILL')
    // Both listeners on one port is a setting the server refuses to start with.
    const broken = new ServerProcess({ COLLAB_PORT: String(environment.ports.api) })
    const startedAt = Date.now()

    await expect(broken.start()).rejects.toThrow(/exited with code 1 before it answered/)

    expect(Date.now() - startedAt).toBeLessThan(20_000)
    await server.start()
  })
})
