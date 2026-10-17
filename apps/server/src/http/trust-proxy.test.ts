import { describe, expect, it } from 'vitest'
import { trustProxy } from './trust-proxy.ts'

const read = (value: string | undefined) => trustProxy.safeParse(value)

describe('who may say what the address of the caller is', () => {
  it.each([
    ['nothing is set', undefined, false],
    ['it is empty', '', false],
    ['one keyword with spaces around it', ' uniquelocal ', ['uniquelocal']],
    ['a single address', '10.0.0.5', ['10.0.0.5']],
    ['a range of addresses', '172.18.0.0/16', ['172.18.0.0/16']],
    ['an IPv6 range', 'fd00::/8', ['fd00::/8']],
    ['a list of addresses and keywords', '10.0.0.5, loopback ,uniquelocal', ['10.0.0.5', 'loopback', 'uniquelocal']],
  ])('is read when %s', (_name, value, expected) => {
    expect(read(value)).toMatchObject({ success: true, data: expected })
  })

  it.each([
    ['true, which believes any caller', 'true'],
    ['an asterisk', '*'],
    ['a number of proxies, which Fastify cannot check', '1'],
    ['a word that is not an address', 'caddy'],
    ['a range with a prefix longer than the address', '10.0.0.0/33'],
    ['a range with something after the prefix', '10.0.0.0/8/8'],
    ['a number in a list with an address', '1,10.0.0.5'],
    ['a list with one entry that is wrong', '10.0.0.5,everyone'],
  ])('is refused when it is %s', (_name, value) => {
    expect(read(value).success).toBe(false)
  })
})
