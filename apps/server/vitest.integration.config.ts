import { defineConfig } from 'vitest/config'

// The integration tests: a real PostgreSQL 17 from Testcontainers, so Docker has to be running. Run with
// `npm run test:integration`; the root `npm test` does not include them.
export default defineConfig({
  test: {
    name: 'server-integration',
    include: ['test/**/*.test.ts'],
    exclude: ['test/support/**', '**/node_modules/**'],
    globalSetup: ['./test/support/postgres-global-setup.ts', './test/support/coverage-global-setup.ts'],
    setupFiles: ['./test/support/coverage-setup.ts'],
    // Starting a container and pulling its image takes longer than a test.
    hookTimeout: 120_000,
    // In CI a failed run leaves its report behind as an artifact, next to the database log (see the global setup).
    reporters: process.env['CI'] === undefined ? ['default'] : ['default', 'junit'],
    outputFile: { junit: 'test-results/integration.junit.xml' },
  },
})
