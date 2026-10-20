import { describe, expect, it } from 'vitest'
import { keepMatchInView, omission } from './keepMatchInView.ts'
import { splitByTerm } from './splitByTerm.ts'

describe('keepMatchInView', () => {
  const view = (text: string, term: string, lead: number) =>
    keepMatchInView(splitByTerm(text, term), lead).map((chunk) => (chunk.match ? `[${chunk.text}]` : chunk.text))

  it.each([
    { case: 'a match near the start', text: 'The launch moves', lead: 8, shown: ['The ', '[launch]', ' moves'] },
    { case: 'a match at the start', text: 'Launch moves', lead: 8, shown: ['[Launch]', ' moves'] },
    { case: 'no match', text: 'Nothing here for you', lead: 4, shown: ['Nothing here for you'] },
    {
      case: 'a cut that falls on a space',
      text: 'wordone wordtwo launch',
      lead: 9,
      shown: [`${omission}wordtwo `, '[launch]'],
    },
    {
      case: 'a match far from the start',
      text: 'Shipped the pricing page and the legal review; launch moves',
      lead: 10,
      shown: [`${omission}review; `, '[launch]', ' moves'],
    },
  ])('shows $case', ({ text, lead, shown }) => {
    expect(view(text, 'launch', lead)).toEqual(shown)
  })

  it('cuts between letters, never inside an emoji', () => {
    const family = '👩‍👩‍👧'
    expect(view(`${family} ${family} ${family} launch`, 'launch', 4)).toEqual([
      `${omission}${family} ${family} `,
      '[launch]',
    ])
  })
})
