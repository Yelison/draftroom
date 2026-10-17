import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// The shared `DataSource` battery against the real server (`npm run test:contract-real`), which needs the database of the
// stack to be up. It is separate from the unit tests of the app because it talks to a server and to PostgreSQL.
export default defineConfig({
  root: resolve(import.meta.dirname, '../..'),
  test: {
    name: 'contract-real-server',
    environment: 'node',
    include: ['e2e-collab/contract/**/*.contract.ts'],
    globalSetup: ['e2e-collab/contract/globalSetup.ts'],
    // One server and one database, and each test makes its own workspace: nothing here gains from running side by side.
    fileParallelism: false,
    testTimeout: 60_000,
  },
})
