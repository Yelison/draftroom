// Run by the Dockerfile in the stage that installs the server's dependencies, from the root of the workspace.
//
// `npm ci --omit=dev --workspace @draftroom/server` still installs a package the web app needs in production when the server
// lists it only for its tests (the collaboration provider and the Tiptap extension): the lockfile marks it as a production
// dependency because of the other workspace. This removes every installed package that the server's own production
// dependencies do not reach, then checks that no development dependency of the server is left unless they do.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const server = '@draftroom/server'

/** The directories of the packages that the server's production dependencies reach, as npm resolved them. */
function neededDirectories(): Set<string> {
  const listing = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable', '--workspace', server], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  return new Set(
    listing
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => realpathSync(line)),
  )
}

/** Every package directory under a `node_modules`, at any depth: `name`, `@scope/name`, and the ones nested in a package. */
function installedDirectories(nodeModules: string): string[] {
  return readdirSync(nodeModules, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return []
    const path = join(nodeModules, entry.name)
    const packages = entry.name.startsWith('@') ? readdirSync(path).map((name) => join(path, name)) : [path]
    return packages.flatMap((directory) => {
      const nested = join(directory, 'node_modules')
      return [directory, ...(existsSync(nested) ? installedDirectories(nested) : [])]
    })
  })
}

const needed = neededDirectories()
const surplus = installedDirectories(join(root, 'node_modules')).filter(
  (directory) => !needed.has(realpathSync(directory)),
)
for (const directory of surplus) rmSync(directory, { recursive: true, force: true })
console.log(
  `removed ${surplus.length} packages the server does not need: ${surplus.map((path) => path.replace(`${root}/node_modules/`, '')).join(', ') || 'none'}`,
)

// The check that does not depend on the removal above: whatever the server lists as a development dependency has to be gone,
// except what its production dependencies need anyway (`ws`, for instance).
const manifest: unknown = JSON.parse(readFileSync(join(root, 'apps/server/package.json'), 'utf8'))
const development =
  typeof manifest === 'object' &&
  manifest !== null &&
  'devDependencies' in manifest &&
  typeof manifest.devDependencies === 'object' &&
  manifest.devDependencies !== null
    ? Object.keys(manifest.devDependencies)
    : []
const neededNames = new Set([...needed].map((directory) => directory.replace(/^.*\/node_modules\//, '')))
const leftOver = development.filter((name) => existsSync(join(root, 'node_modules', name)) && !neededNames.has(name))
if (leftOver.length > 0) {
  console.error(`development dependencies of the server are in the image: ${leftOver.join(', ')}`)
  process.exit(1)
}
