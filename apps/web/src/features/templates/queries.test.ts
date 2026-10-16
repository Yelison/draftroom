import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { templatesQuery } from './queries.ts'

describe('the templates query', () => {
  it('keeps the templates of each language apart, so a change of language never shows the other one', () => {
    const dataSource = {} as DataSource

    expect(templatesQuery(dataSource, 'en').queryKey).not.toEqual(templatesQuery(dataSource, 'es').queryKey)
  })
})
