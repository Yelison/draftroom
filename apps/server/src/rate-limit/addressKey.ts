import { isIPv6 } from 'node:net'

const mappedIPv4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i

/** The eight 16-bit groups of an IPv6 address, written out (`::` filled in). A tail written as an IPv4 address is two groups. */
function groupsOf(address: string): number[] {
  const withoutZone = address.split('%')[0] ?? address
  const [head = '', tail] = withoutZone.split('::')
  const parse = (part: string): number[] =>
    part === ''
      ? []
      : part.split(':').flatMap((group) => {
          if (!group.includes('.')) return [parseInt(group, 16)]
          const [a = 0, b = 0, c = 0, d = 0] = group.split('.').map(Number)
          return [a * 256 + b, c * 256 + d]
        })
  const before = parse(head)
  const after = tail === undefined ? [] : parse(tail)
  const fill = tail === undefined ? [] : Array<number>(8 - before.length - after.length).fill(0)
  return [...before, ...fill, ...after]
}

/**
 * The key an address is counted under. An IPv4 address is itself (an IPv4-mapped IPv6 address too, which is what a
 * dual-stack listener reports). An IPv6 address is its /64: a home connection is given a whole /64, so counting each
 * address alone would hand one household 2^64 buckets, and it could push other people's out of a full store.
 */
export function addressKey(ip: string): string {
  const mapped = mappedIPv4.exec(ip)?.[1]
  if (mapped !== undefined) return mapped
  if (!isIPv6(ip)) return ip
  return `${groupsOf(ip)
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`
}
