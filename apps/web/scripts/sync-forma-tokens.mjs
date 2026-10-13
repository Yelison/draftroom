// Writes `src/styles/forma-tokens.css` from the `tokens.css` of `@yelison/forma-ui`.
//
//   npm run sync:forma-tokens -w @draftroom/web            writes the copy
//   npm run sync:forma-tokens -w @draftroom/web -- --check writes nothing and fails if the copy differs from the package
//
// The copy is a header of Draftroom's own followed by the EXACT content of the package's file. Only the content
// decides whether it is up to date: the version in the header is the one of the last sync, so a patch release that
// does not touch the tokens does not force a new copy. `src/styles/tokens.sync.test.ts` makes the same comparison.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = join(WEB_ROOT, 'src/styles/forma-tokens.css')

/** The end of the header comment: the package's content starts right after it. */
const HEADER_END = '*/\n\n'

/** The header names no block of `tokens.css` (`:root {`...): tests look for those blocks by text. */
export function header(version) {
  return `/* Generated from \`@yelison/forma-ui@${version}\` (the version of the last sync): do not edit by hand.
 * Run \`npm run sync:forma-tokens -w @draftroom/web\` to regenerate it. Below is the package's \`tokens.css\`,
 * unchanged. Draftroom's own tokens live in their own files, never here. \`tokens.sync.test.ts\` fails when the
 * content differs from the installed package. */

`
}

/** The package is resolved through its `exports`, not through the layout of its `dist/`, which may change. */
export function readPackage() {
  const require = createRequire(join(WEB_ROOT, 'package.json'))
  return {
    version: JSON.parse(readFileSync(require.resolve('@yelison/forma-ui/package.json'), 'utf8')).version,
    css: readFileSync(require.resolve('@yelison/forma-ui/tokens.css'), 'utf8'),
  }
}

function main(check) {
  const { version, css } = readPackage()
  let current = null
  try {
    current = readFileSync(TARGET, 'utf8')
  } catch {
    // No copy yet: it is created below.
  }
  const upToDate = current !== null && current.slice(current.indexOf(HEADER_END) + HEADER_END.length) === css
  if (check) {
    if (!upToDate) {
      console.error(`out of date: ${TARGET}\nRun \`npm run sync:forma-tokens -w @draftroom/web\`.`)
      process.exit(1)
    }
    console.log(`forma-tokens.css matches @yelison/forma-ui@${version}`)
    return
  }
  writeFileSync(TARGET, header(version) + css)
  console.log(`forma-tokens.css written from @yelison/forma-ui@${version}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.includes('--check'))
