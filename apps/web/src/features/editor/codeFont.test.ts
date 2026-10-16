/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/* Code is set in Forma UI's monospace tokens, never in the generic `monospace` family, which a browser draws a size
 * smaller than the text around it. These tests read the stylesheets, as jsdom does not apply a CSS Module. */

const directory = import.meta.dirname
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const read = (file: string) => withoutComments(readFileSync(join(directory, file), 'utf8'))

/** The body of the first rule whose selector is exactly `selector`. */
function ruleBody(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
}

describe('the monospace font of the editor', () => {
  it('sets the code mark of the document in the family token, relative to the text around it', () => {
    const body = ruleBody(read('Prose.module.css'), '.prose code')

    expect(body).toMatch(/font-family:\s*var\(--font-family-mono\);/)
    expect(body).toMatch(/font-size:\s*0\.875em;/)
  })

  it('sets the code button of the toolbar in the code font token', () => {
    expect(ruleBody(read('Toolbar.module.css'), '.code')).toMatch(/font:\s*var\(--font-code\);/)
  })

  it('never falls back to the generic monospace family in any stylesheet of the editor', () => {
    const stylesheets = readdirSync(directory).filter((file) => file.endsWith('.css'))

    expect(stylesheets).toContain('Prose.module.css')
    for (const file of stylesheets) {
      expect(read(file), file).not.toMatch(/font(?:-family)?:[^;]*\bmonospace\b/)
    }
  })
})
