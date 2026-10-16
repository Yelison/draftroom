import { describe, expect, it } from 'vitest'
import { createMockServer } from '../../data/mock/createMockDataSource.ts'
import { marta } from '../../data/mock/fixtures/index.ts'
import { templatesQuery } from './queries.ts'

describe('the templates query', () => {
  it('keeps the templates of each language apart, so a change of language never shows the other one', () => {
    const dataSource = createMockServer().connect({ signedInAs: marta.email })

    expect(templatesQuery(dataSource, 'en').queryKey).not.toEqual(templatesQuery(dataSource, 'es').queryKey)
  })
})
