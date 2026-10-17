/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import { firstPaintScripts } from './scripts/first-paint.ts'
import { headScripts } from './scripts/head-scripts.ts'
import { messagesAst } from './scripts/messages-ast.ts'

// Several checkouts can run side by side: each one takes its own ports from the environment. A port that is set is
// strict, because a busy one is an error, not a reason to move to another that could belong to another checkout.
// Without the variables Vite keeps its own defaults.
const strictPort = (variable: string) =>
  process.env[variable] ? { port: Number(process.env[variable]), strictPort: true } : {}

const pseudoDirectory = '__pseudo__'

// The data source is chosen when the app is built: the real API in a production build, the in-memory mock in every other
// mode (development, the mocked end-to-end suite, tests, the pseudo-locale build). `VITE_DATA_SOURCE` overrides it, so
// `vite build --mode production` with `VITE_DATA_SOURCE=mock` makes a build for a static demo.
const dataSourceFor = (mode: string, variables: Record<string, string>): 'http' | 'mock' => {
  const chosen = variables.VITE_DATA_SOURCE ?? (mode === 'production' ? 'http' : 'mock')
  if (chosen !== 'http' && chosen !== 'mock')
    throw new Error(`VITE_DATA_SOURCE is "${chosen}": it must be http or mock`)
  return chosen
}

// Until the session cookie exists (T7.1) the only identity is the `X-Dev-User` header, which a browser cannot put on a
// WebSocket upgrade. The end-to-end suite against the real server (`playwright.collab.config.ts`) therefore serves `/api`
// and `/collab` from the origin of the app, through this proxy, which turns the test cookie each browser context holds
// into that header. It exists only when both targets are named in the environment, and only for the servers of
// development and preview: it is never part of a build, and a build served without the variables ignores the cookie.
// docs/decisions/0015-real-stack-e2e-identity.md has the reasoning; T7.1 replaces all of it with the session.
const identityCookie = 'dr_dev_user'
const identityHeader = 'x-dev-user'

const identityOf = (cookieHeader: string | undefined): string | undefined => {
  const pair = cookieHeader?.split(';').find((entry) => entry.trim().startsWith(`${identityCookie}=`))
  if (pair === undefined) return undefined
  const value = pair.slice(pair.indexOf('=') + 1).trim()
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const testIdentityProxy = (variables: NodeJS.ProcessEnv): { proxy?: Record<string, ProxyOptions> } => {
  const api = variables.E2E_API_ORIGIN
  const collaboration = variables.E2E_COLLAB_ORIGIN
  if (!api || !collaboration) return {}
  // Whatever header the browser sent is dropped: the identity is only ever the one the cookie names.
  const asCookieIdentity: ProxyOptions['configure'] = (proxy) => {
    const copy = (
      request: { removeHeader(name: string): void; setHeader(name: string, value: string): void },
      cookie?: string,
    ) => {
      request.removeHeader(identityHeader)
      const identity = identityOf(cookie)
      if (identity !== undefined) request.setHeader(identityHeader, identity)
    }
    proxy.on('proxyReq', (proxyReq, request) => copy(proxyReq, request.headers.cookie))
    proxy.on('proxyReqWs', (proxyReq, request) => copy(proxyReq, request.headers.cookie))
  }
  return {
    proxy: {
      '/api': { target: api, configure: asCookieIdentity },
      '/collab': { target: collaboration, ws: true, configure: asCookieIdentity },
    },
  }
}

export default defineConfig(({ command, mode }) => ({
  // The pseudo-locale build is served by the same preview as the real one, from a directory of its own inside dist/.
  base: mode === 'pseudo' ? `/${pseudoDirectory}/` : '/',
  build: {
    outDir: mode === 'pseudo' ? `dist/${pseudoDirectory}` : 'dist',
  },
  resolve: {
    // The production build ships the messages as syntax trees (scripts/messages-ast.ts), so react-intl never parses an
    // ICU message and the parser is left out of the bundle: this entry has `parse` throw instead. Tests and the dev
    // server pass plain strings, which need the real parser.
    alias:
      command === 'build'
        ? [
            {
              find: /^@formatjs\/icu-messageformat-parser$/,
              replacement: '@formatjs/icu-messageformat-parser/no-parser.js',
            },
          ]
        : [],
  },
  // Written as a literal, so that code which compares it is folded away by the bundler and the unused data source is
  // never part of the bundle.
  define: {
    'import.meta.env.VITE_DATA_SOURCE': JSON.stringify(
      dataSourceFor(mode, loadEnv(mode, import.meta.dirname, 'VITE_')),
    ),
  },
  plugins: [
    react(),
    firstPaintScripts(headScripts),
    messagesAst({
      directory: resolve(import.meta.dirname, 'src/i18n'),
      // `npm run build:pseudo` builds the app with accented, longer text in place of the messages, to check that no
      // layout depends on the length of English. It is never what is deployed.
      pseudoLocale: mode === 'pseudo' ? 'en-XA' : undefined,
    }),
  ],
  server: { ...strictPort('DEV_SERVER_PORT'), ...(command === 'serve' ? testIdentityProxy(process.env) : {}) },
  preview: { ...strictPort('PLAYWRIGHT_PORT'), ...(command === 'serve' ? testIdentityProxy(process.env) : {}) },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
}))
