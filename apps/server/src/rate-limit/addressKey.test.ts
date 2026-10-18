import { describe, expect, it } from 'vitest'
import { addressKey } from './addressKey.ts'

describe('the key an address is counted under', () => {
  it.each([
    ['an IPv4 address', '203.0.113.9', '203.0.113.9'],
    ['an IPv4-mapped IPv6 address, which a dual-stack listener reports', '::ffff:203.0.113.9', '203.0.113.9'],
    ['an IPv6 address, as its /64', '2001:db8:1:2:aaaa:bbbb:cccc:dddd', '2001:db8:1:2::/64'],
    ['an IPv6 address written with ::', '2001:db8:1:2::1', '2001:db8:1:2::/64'],
    ['an IPv6 address with leading zeros', '2001:0db8:0001:0002:0000:0000:0000:0001', '2001:db8:1:2::/64'],
    ['an IPv6 address whose /64 is mostly zeros', '2001:db8::5', '2001:db8:0:0::/64'],
    ['the IPv6 loopback', '::1', '0:0:0:0::/64'],
    ['a link-local address with a zone', 'fe80::1%eth0', 'fe80:0:0:0::/64'],
  ])('is, for %s, %s', (_name, address, key) => {
    expect(addressKey(address)).toBe(key)
  })

  it('is the same for two addresses of one /64 and different for the next /64', () => {
    expect(addressKey('2001:db8:1:2::1')).toBe(addressKey('2001:db8:1:2:ffff:ffff:ffff:ffff'))
    expect(addressKey('2001:db8:1:2::1')).not.toBe(addressKey('2001:db8:1:3::1'))
  })
})
