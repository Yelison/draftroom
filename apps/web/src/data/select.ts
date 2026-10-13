import type { DataSource } from './DataSource.ts'
import { createHttpDataSource } from './http/HttpDataSource.ts'

/**
 * The data source this build was made for. The choice is made when the app is built (`VITE_DATA_SOURCE`, which
 * `vite.config.ts` defaults to `mock` everywhere but in a production build), and the comparison below is between two
 * literals, so the bundler drops the branch that was not chosen. The mock is imported dynamically for the same reason:
 * in an `http` build nothing reaches it, and `e2e/production-bundle.spec.ts` checks that no trace of it is left.
 */
export async function selectDataSource(): Promise<DataSource> {
  if (import.meta.env.VITE_DATA_SOURCE === 'mock') {
    const { createMockDataSource } = await import('./mock/createMockDataSource.ts')
    return createMockDataSource()
  }
  return createHttpDataSource(
    import.meta.env.VITE_API_URL === undefined ? {} : { baseUrl: import.meta.env.VITE_API_URL },
  )
}
