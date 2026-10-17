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
})
