import { defineConfig, devices } from '@playwright/test'
import { environment } from './e2e-collab/environment.ts'

const isCI = Boolean(process.env.CI)

/**
 * The collaboration of two browsers against the real stack: PostgreSQL, the server and the production build of the app in
 * `http` mode, served by `vite preview`. The suite starts and stops the server itself, so the stack outside it is the
 * database alone (see docs/decisions/0015-real-stack-e2e-identity.md for how a browser is identified until T7.1).
 */
export default defineConfig({
  testDir: './e2e-collab',
  outputDir: 'test-results/collab',
  globalSetup: './e2e-collab/globalSetup.ts',
  // One server and one database for every test, and tests that stop the server: they cannot run side by side.
  workers: 1,
  fullyParallel: false,
  forbidOnly: isCI,
  // A test that passes on a second try has shown a race, and here a race is a lost or duplicated edit.
  retries: 0,
  timeout: 120_000,
  reporter: isCI ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report/collab' }]] : 'list',
  use: {
    baseURL: environment.appOrigin,
    // Kept for the failures only: a trace of every passing test would be most of the artifact for nothing.
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The production build, which talks to the real API (`http`), in a directory of its own so that the build the mocked
    // suite serves is never overwritten. A server that was already running is never reused: it could be serving an older build.
    command:
      'npx vite build --mode production --outDir dist/collab --emptyOutDir && npx vite preview --outDir dist/collab',
    env: {
      PLAYWRIGHT_PORT: String(environment.ports.app),
      // Both targets set is what turns on the test proxy of `vite.config.ts`; nothing else does.
      E2E_API_ORIGIN: environment.apiOrigin,
      E2E_COLLAB_ORIGIN: environment.collaborationOrigin,
    },
    url: environment.appOrigin,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
