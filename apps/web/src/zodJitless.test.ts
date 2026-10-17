import { core } from 'zod'
import { describe, expect, it } from 'vitest'
import './zodJitless.ts'

describe('the schema validator under a content security policy', () => {
  it('is told not to try to compile code, which the policy forbids and reports', () => {
    expect(core.globalConfig.jitless).toBe(true)
  })
})
