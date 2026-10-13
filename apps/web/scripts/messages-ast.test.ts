import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'
import { catalogueModule } from './messages-ast.ts'

const directory = resolve(import.meta.dirname, '../src/i18n')
const catalogue = resolve(directory, 'en.json')

/** The messages a catalogue module exports, read back from its code. */
function exported(code: string): Record<string, unknown[]> {
  return JSON.parse(code.replace(/^export default /, ''))
}

describe('catalogueModule', () => {
  it('exports the syntax tree of every message, not the strings', () => {
    const module = catalogueModule(catalogue, { directory })
    const trees = exported(module?.code ?? '')

    expect(Object.keys(trees).sort()).toEqual(Object.keys(en).sort())
    expect(trees['nav.documents']).toEqual([{ type: 0, value: en['nav.documents'] }])
  })

  it('keeps the arguments of a message as nodes', () => {
    const trees = exported(catalogueModule(catalogue, { directory })?.code ?? '')

    expect(trees['preferences.language.announcement']).toContainEqual({ type: 1, value: 'language' })
  })

  it.each([
    { case: 'a JSON file in another directory', id: resolve(directory, '../elsewhere/en.json') },
    { case: 'a file that is not JSON', id: resolve(directory, 'locale.ts') },
    { case: 'a JSON file in a subdirectory', id: resolve(directory, 'nested/en.json') },
  ])('leaves $case alone', ({ id }) => {
    expect(catalogueModule(id, { directory })).toBeNull()
  })

  it('compiles the pseudo-locale build to longer, accented text with the same ids and arguments', () => {
    const real = exported(catalogueModule(catalogue, { directory })?.code ?? '')
    const pseudo = exported(catalogueModule(catalogue, { directory, pseudoLocale: 'en-XA' })?.code ?? '')
    const text = (tree: unknown[]) => JSON.stringify(tree)

    expect(Object.keys(pseudo).sort()).toEqual(Object.keys(real).sort())
    expect(text(pseudo['nav.documents'] ?? [])).toMatch(/\P{ASCII}/u)
    expect(text(pseudo['nav.documents'] ?? []).length).toBeGreaterThan(text(real['nav.documents'] ?? []).length)
    expect(pseudo['preferences.language.announcement']).toContainEqual({ type: 1, value: 'language' })
  })
})
