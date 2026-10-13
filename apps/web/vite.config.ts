/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { firstPaintScripts } from './scripts/first-paint.ts'
import { headScripts } from './scripts/head-scripts.ts'
import { messagesAst } from './scripts/messages-ast.ts'

// Several checkouts can run side by side: each one takes its own ports from the environment. A port that is set is
// strict, because a busy one is an error, not a reason to move to another that could belong to another checkout.
// Without the variables Vite keeps its own defaults.
const strictPort = (variable: string) =>
  process.env[variable] ? { port: Number(process.env[variable]), strictPort: true } : {}

const pseudoDirectory = '__pseudo__'

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
  server: strictPort('DEV_SERVER_PORT'),
  preview: strictPort('PLAYWRIGHT_PORT'),
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
}))
