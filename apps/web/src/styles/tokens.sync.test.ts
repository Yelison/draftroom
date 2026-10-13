/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/* `forma-tokens.css` is a generated copy of the `tokens.css` of `@yelison/forma-ui`: a header of Draftroom's and, below
 * it, the package's file unchanged. These tests fail when the content differs from the installed package, so an update
 * of the package that changes tokens does not merge until someone runs `npm run sync:forma-tokens -w @draftroom/web`
 * and reviews the visual change. The version in the header is the one of the last sync and is not compared: a patch
 * that leaves the tokens alone would otherwise never merge by itself.
 *
 * The package is resolved through its `exports`, as the script does, not through the layout of its `dist/`. */

const stylesDirectory = import.meta.dirname
const require = createRequire(import.meta.url)
const packageTokens = readFileSync(require.resolve('@yelison/forma-ui/tokens.css'), 'utf8')
const copy = readFileSync(join(stylesDirectory, 'forma-tokens.css'), 'utf8')

/** One comment with the version and the command that regenerates the file. */
const HEADER = /^\/\* Generated from `@yelison\/forma-ui@\d+\.\d+\.\d+[^`]*`[^]*?npm run sync:forma-tokens[^]*?\*\/\n\n/

/** The `--*` names declared (to the left of a `:`) in a stylesheet, comments left out. */
const declaredNames = (css: string) =>
  new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-z0-9-]+)\s*:/g)].map(([, name = '']) => name))

describe('forma-tokens.css', () => {
  it('starts with the header that says how it is generated', () => {
    expect(copy).toMatch(HEADER)
  })

  it("carries the installed package's tokens.css below it, unchanged (run `npm run sync:forma-tokens`)", () => {
    expect(copy.replace(HEADER, '')).toBe(packageTokens)
  })
})

describe("Draftroom's own stylesheets never redeclare a token of the package", () => {
  const packageNames = declaredNames(packageTokens)
  // Every stylesheet under src/, CSS Modules included: the screens of the product arrive as modules.
  const srcDirectory = join(stylesDirectory, '..')
  const ownFiles = readdirSync(srcDirectory, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.css') && file !== join('styles', 'forma-tokens.css'))
    .sort()

  it('has the package tokens to compare against', () => {
    // Without this a pattern that finds nothing would make the next test pass on an empty set.
    expect(packageNames).toContain('--color-bg')
    expect(ownFiles).toContain(join('styles', 'global.css'))
    expect(ownFiles.some((file) => file.endsWith('.module.css'))).toBe(true)
  })

  it.each(ownFiles)('%s', (file) => {
    const declared = declaredNames(readFileSync(join(srcDirectory, file), 'utf8'))

    expect([...declared].filter((name) => packageNames.has(name))).toEqual([])
  })
})
