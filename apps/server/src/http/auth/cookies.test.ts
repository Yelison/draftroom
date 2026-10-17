import { describe, expect, it } from 'vitest'
import { cookiesOf } from './cookies.ts'

describe('reading the cookies of a request', () => {
  it.each([
    ['one cookie', 'dr_session=abc', { dr_session: 'abc' }],
    ['several, with the spaces browsers put between them', 'a=1; b=2;c=3', { a: '1', b: '2', c: '3' }],
    ['a value in quotes', 'a="quoted value"', { a: 'quoted value' }],
    ['a value that is percent-encoded', 'a=caf%C3%A9%20au%20lait', { a: 'café au lait' }],
    ['a value that contains an equals sign', 'a=b=c==', { a: 'b=c==' }],
    ['a value that is empty', 'a=; b=2', { a: '', b: '2' }],
  ])('reads %s', (_case, header, expected) => {
    expect(cookiesOf(header)).toEqual(expected)
  })

  it('keeps the first of two cookies with the same name, which is the one the browser sends for the narrowest path', () => {
    expect(cookiesOf('dr_session=first; dr_session=second')).toEqual({ dr_session: 'first' })
  })

  it.each([
    ['a part with no equals sign', 'garbage; a=1', { a: '1' }],
    ['a part with no name', '=nameless; a=1', { a: '1' }],
    ['an encoding that is not valid, which is kept as it came', 'a=%E0%A4%A', { a: '%E0%A4%A' }],
  ])('skips or keeps as it came %s, and still reads the rest', (_case, header, expected) => {
    expect(cookiesOf(header)).toEqual(expected)
  })

  it('has no cookies for a header that is missing or is a list, which no browser sends', () => {
    expect([cookiesOf(undefined), cookiesOf(['a=1', 'b=2'])]).toEqual([{}, {}])
  })

  it('does not let a cookie named like a property of an object reach one', () => {
    const cookies = cookiesOf('__proto__=x; constructor=y')

    expect(Object.getPrototypeOf(cookies)).toBeNull()
    expect(cookies['toString']).toBeUndefined()
  })
})
