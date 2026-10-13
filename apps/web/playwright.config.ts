import { defineConfig, devices } from '@playwright/test'

// Several checkouts run side by side, each on the ports it was given; without the variable Vite's own default is used.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173)
const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './e2e',
  // Two workers on a laptop that other agents share; CI picks what its runner has.
  ...(isCI ? {} : { workers: 2 }),
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    // Kept for the failures only: a trace of every passing test would be most of the artifact for nothing.
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // What is served is the production build of the app with the mock data source, which is what the suite tests. A
    // server that was already running is never reused: it could be serving an older build.
    command: `npm run build -- --mode mock && npm run preview -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
