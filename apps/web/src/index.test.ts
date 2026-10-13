import { describe, expect, it } from 'vitest'
import { packageName } from './index.ts'

describe('@draftroom/web', () => {
  it('exposes its package name from the entry point', () => {
    expect(packageName).toBe('@draftroom/web')
  })
})
