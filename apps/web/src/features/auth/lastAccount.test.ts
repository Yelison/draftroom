import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  accountsBeingLeft,
  forgetAccount,
  markAccountsBeingLeft,
  rememberAccount,
  rememberedAccount,
} from './lastAccount.ts'

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
    expect(accountsBeingLeft()).toEqual([])
    expect(() => markAccountsBeingLeft(['user-1'])).not.toThrow()
  })
})

describe('the accounts that are being left', () => {
  // A switch of account asks what to do with what the old one kept, and the question can be left unanswered for good (the tab
  // is closed). What is being left is written down apart from the account the browser holds, so that it is asked again.
  it('are none until a switch marks them, and are what it marked, in order, until it marks others', () => {
    expect(accountsBeingLeft()).toEqual([])

    markAccountsBeingLeft(['user-1', 'user-2'])
    expect(accountsBeingLeft()).toEqual(['user-1', 'user-2'])

    markAccountsBeingLeft(['user-2'])
    expect(accountsBeingLeft()).toEqual(['user-2'])
  })

  it('are none again once the last is marked as left, and leave no key behind', () => {
    markAccountsBeingLeft(['user-1'])

    markAccountsBeingLeft([])

    expect(accountsBeingLeft()).toEqual([])
    expect(localStorage.getItem('draftroom-leaving-accounts')).toBeNull()
  })

  it.each([['not json'], ['{"a":1}'], ['[1,2]'], ['["ok", 2]']])(
    'are none for what a page of another version wrote (%s)',
    (written) => {
      localStorage.setItem('draftroom-leaving-accounts', written)

      expect(accountsBeingLeft()).toEqual([])
    },
  )
})
