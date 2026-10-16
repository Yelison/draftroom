import { describe, expect, it } from 'vitest'
import { isOriginAllowed } from './upgradeGuard.ts'

describe('the origin of a WebSocket upgrade', () => {
  const allowedOrigins = ['https://app.harborpine.example', 'http://localhost:5381']

  // Rows: the Origin header, then whether this is development or test, and the answer.
  const rows: readonly (readonly [string | undefined, boolean, boolean])[] = [
    ['https://app.harborpine.example', false, true],
    ['http://localhost:5381', false, true],
    ['https://evil.example', false, false],
    ['https://evil.example', true, false],
    // The same host on another scheme or port is another origin.
    ['http://app.harborpine.example', false, false],
    ['https://app.harborpine.example:8443', false, false],
    // A browser always sends one; its absence is allowed only where there are no browsers to protect.
    [undefined, true, true],
    [undefined, false, false],
  ]

  it.each(rows)('%s, with development %j, is allowed: %j', (origin, development, allowed) => {
    expect(isOriginAllowed(origin, { allowedOrigins, development })).toBe(allowed)
  })

  it('refuses every browser when no origin is allowed', () => {
    expect(isOriginAllowed('https://app.harborpine.example', { allowedOrigins: [], development: true })).toBe(false)
  })
})
