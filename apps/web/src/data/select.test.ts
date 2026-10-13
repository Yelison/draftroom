import { describe, expect, it } from 'vitest'
import { selectDataSource } from './select.ts'

describe('selectDataSource', () => {
  // The tests run in Vite's `test` mode, which builds the mock in: the `http` side is proved by the production build
  // (`e2e/production-bundle.spec.ts`), where the other branch must be gone.
  it('gives the mock, with the demo person signed in, in every mode but production', async () => {
    const dataSource = await selectDataSource()

    await expect(dataSource.getMe()).resolves.toMatchObject({ name: 'Marta Ruiz' })
  })
})
