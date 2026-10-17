import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetAccount, rememberAccount, rememberedAccount } from './lastAccount.ts'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('the account this browser last signed in with', () => {
  it('is nobody until one signs in, then that one, then nobody again once it signs out', () => {
    expect(rememberedAccount()).toBeNull()

    rememberAccount('user-1')
    expect(rememberedAccount()).toBe('user-1')

    forgetAccount()
    expect(rememberedAccount()).toBeNull()
  })

  it('is the last one when another signs in', () => {
    rememberAccount('user-1')
    rememberAccount('user-2')

    expect(rememberedAccount()).toBe('user-2')
  })

  it('does not fail where the browser lets nothing be kept: it only means that no switch is noticed', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })

    expect(rememberedAccount()).toBeNull()
    expect(() => rememberAccount('user-1')).not.toThrow()
    expect(() => forgetAccount()).not.toThrow()
  })
})
