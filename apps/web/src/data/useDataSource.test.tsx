import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { DataSourceContext } from './DataSourceContext.ts'
import { createMockDataSource } from './mock/createMockDataSource.ts'
import { useDataSource } from './useDataSource.ts'

describe('useDataSource', () => {
  it('gives a screen the data source that was provided', () => {
    const dataSource = createMockDataSource()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <DataSourceContext value={dataSource}>{children}</DataSourceContext>
    )

    const { result } = renderHook(() => useDataSource(), { wrapper })

    expect(result.current).toBe(dataSource)
  })

  it('fails loudly where none was provided, instead of reading from nowhere', () => {
    expect(() => renderHook(() => useDataSource())).toThrow('useDataSource needs a DataSourceContext')
  })
})
