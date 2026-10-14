import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { migrations } from './index.ts'

describe('the list of migrations', () => {
  it('registers every migration file of the folder, so none is left out by mistake', () => {
    const files = readdirSync(new URL('.', import.meta.url))
      .filter((name) => /^\d{4}_.+\.ts$/.test(name) && !name.endsWith('.test.ts'))
      .map((name) => name.replace(/\.ts$/, ''))

    expect(Object.keys(migrations).sort()).toEqual(files.sort())
  })

  it('names them with a four-digit number, which is what keeps them in order', () => {
    expect(Object.keys(migrations).every((name) => /^\d{4}_[a-z_]+$/.test(name))).toBe(true)
  })

  it('only moves forward: no migration can be undone', () => {
    expect(Object.values(migrations).filter((migration) => migration.down !== undefined)).toEqual([])
  })
})
