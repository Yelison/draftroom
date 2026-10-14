import { defineConfig } from 'vitest/config'

// The unit tests: no database, no Docker. They are what the root `npm test` runs for the server; the integration tests
// have their own configuration, `vitest.integration.config.ts`.
export default defineConfig({
  test: {
    name: 'server',
    include: ['src/**/*.test.ts', 'test/support/**/*.test.ts'],
  },
})
