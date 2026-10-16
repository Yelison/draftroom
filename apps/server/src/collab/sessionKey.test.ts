import { describe, expect, it } from 'vitest'
import { connectionSessionId, sessionKey } from './sessionKey.ts'

describe('the hash that stands for a session id', () => {
  const secret = 'a-secret-that-is-long-enough-for-a-hash'

  it('is the same for the same session and secret, and does not contain the session id', () => {
    expect(sessionKey(secret, 'session-1')).toBe(sessionKey(secret, 'session-1'))
    expect(sessionKey(secret, 'session-1')).not.toContain('session-1')
  })

  it('differs for another session and for another secret, so it cannot be computed without the secret', () => {
    expect(sessionKey(secret, 'session-1')).not.toBe(sessionKey(secret, 'session-2'))
    expect(sessionKey(secret, 'session-1')).not.toBe(sessionKey(`${secret}!`, 'session-1'))
  })

  it('is nothing for an identity that has no session, which therefore matches no session', () => {
    expect(connectionSessionId(secret, undefined)).toBeNull()
    expect(connectionSessionId(secret, 'session-1')).toBe(sessionKey(secret, 'session-1'))
  })
})
