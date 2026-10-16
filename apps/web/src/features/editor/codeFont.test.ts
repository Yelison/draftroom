/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/* The font family is decided by the design system, through the tokens of Forma UI, and not by each screen: code is set
 * in its monospace family and never in the generic `monospace` one. These tests read the stylesheets, as jsdom does not
 * apply a CSS Module. */

const directory = import.meta.dirname
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const read = (file: string) => withoutComments(readFileSync(join(directory, file), 'utf8'))

/** The bodies of every rule that has `selector` among its selectors: a later rule for it wins the cascade. */
function ruleBodies(css: string, selector: string) {
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter(([, selectors = '']) => selectors.split(',').some((candidate) => candidate.trim() === selector))
    .map(([, , body = '']) => body)
}

/** The values a body gives to `property`. */
const declared = (body: string, property: string) =>
  [...body.matchAll(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`, 'g'))].map(([, value = '']) => value.trim())

describe('the monospace font of the editor', () => {
  it('sets the code mark of the document in the family token, relative to the text around it, in every rule', () => {
    const bodies = ruleBodies(read('Prose.module.css'), '.prose code')

    const values = (property: string) => new Set(bodies.flatMap((body) => declared(body, property)))

    expect(values('font-family')).toEqual(new Set(['var(--font-family-mono)']))
    expect(values('font-size')).toEqual(new Set(['0.875em']))
  })

  it('sets the code button of the toolbar in the family token and leaves the size and weight to the button', () => {
    const bodies = ruleBodies(read('Toolbar.module.css'), '.code')

    expect(bodies).toEqual([expect.stringMatching(/^\s*font-family:\s*var\(--font-family-mono\);\s*$/)])
  })

  it('never falls back to the generic monospace family in any stylesheet of the editor', () => {
    const stylesheets = readdirSync(directory).filter((file) => file.endsWith('.css'))

    expect(stylesheets).toContain('Prose.module.css')
    for (const file of stylesheets) {
      expect(read(file), file).not.toMatch(/font(?:-family)?:[^;]*\bmonospace\b/)
    }
  })
})
