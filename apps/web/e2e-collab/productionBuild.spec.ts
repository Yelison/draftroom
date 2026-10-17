import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { environment } from './environment.ts'
import { expect, test } from './fixtures.ts'

/**
 * The identity proxy and its cookie belong to the servers of development and preview. A production build holds nothing of
 * them: not the name of the cookie, nor the header it becomes, nor the variables that turn the proxy on, nor the addresses
 * of the servers the proxy forwards to. The build searched is the one this suite serves, made by the configuration with those
 * variables in its environment (`webServer` of `playwright.collab.config.ts`): it is the one that could carry something of
 * them. Whether a server started without the variables has the proxy at all is the unit test of `vite.config.ts`.
 */
const servedBuild = resolve(import.meta.dirname, '../dist/collab')

/** What only the proxy and the suite know. */
const identityMarkers = [
  'dr_dev_user',
  'x-dev-user',
  'E2E_API_ORIGIN',
  'E2E_COLLAB_ORIGIN',
  environment.apiOrigin,
  environment.collaborationOrigin,
]

const contentsOf = (directory: string) =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))

test('the production build served by the suite holds nothing of the identity proxy, of its cookie or of its targets', () => {
  const files = contentsOf(servedBuild)

  // The search can see what it looks for: a header of the real client is in the bundle, so an empty answer is not blindness.
  expect(files.some((content) => content.includes('X-CSRF-Token'))).toBe(true)
  const found = identityMarkers.filter((marker) => files.some((content) => content.includes(marker)))
  expect(found).toEqual([])
})
