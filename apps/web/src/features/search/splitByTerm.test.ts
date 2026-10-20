import { describe, expect, it } from 'vitest'
import { splitByTerm, type TextChunk } from './splitByTerm.ts'

const plain = (text: string): TextChunk => ({ text, match: false })
const found = (text: string): TextChunk => ({ text, match: true })

describe('splitByTerm', () => {
  it.each<{ case: string; text: string; term: string; chunks: TextChunk[] }>([
    { case: 'no match', text: 'Weekly update', term: 'launch', chunks: [plain('Weekly update')] },
    {
      case: 'a match in the middle',
      text: 'Autumn launch plan',
      term: 'launch',
      chunks: [plain('Autumn '), found('launch'), plain(' plan')],
    },
    { case: 'a match at the start', text: 'Launch day', term: 'launch', chunks: [found('Launch'), plain(' day')] },
    {
      case: 'a match at the end',
      text: 'Before the launch',
      term: 'launch',
      chunks: [plain('Before the '), found('launch')],
    },
    { case: 'the whole text', text: 'launch', term: 'launch', chunks: [found('launch')] },
    {
      case: 'several matches',
      text: 'launch, then launch again',
      term: 'launch',
      chunks: [found('launch'), plain(', then '), found('launch'), plain(' again')],
    },
    { case: 'matches that touch', text: 'aaaa', term: 'aa', chunks: [found('aa'), found('aa')] },
    {
      case: 'a term in capitals',
      text: 'Autumn launch plan',
      term: 'LAUNCH',
      chunks: [plain('Autumn '), found('launch'), plain(' plan')],
    },
    { case: 'a text in capitals', text: 'AUTUMN LAUNCH', term: 'launch', chunks: [plain('AUTUMN '), found('LAUNCH')] },
    {
      case: 'an accent in the text',
      text: 'Un café con leche',
      term: 'café',
      chunks: [plain('Un '), found('café'), plain(' con leche')],
    },
    {
      case: 'a capital with an accent',
      text: 'ÁRBOL de la plaza',
      term: 'árbol',
      chunks: [found('ÁRBOL'), plain(' de la plaza')],
    },
    { case: 'ñ in capitals', text: 'EL AÑO NUEVO', term: 'año', chunks: [plain('EL '), found('AÑO'), plain(' NUEVO')] },
    // The server tells accents apart ("cafe" is not in "café"), and so does the mark: it never marks what was not found.
    { case: 'an accent that the term does not have', text: 'Un café', term: 'cafe', chunks: [plain('Un café')] },
    { case: 'an accent that only the term has', text: 'Un cafe', term: 'café', chunks: [plain('Un cafe')] },
    {
      case: 'an emoji',
      text: 'Ship it 🚀 today',
      term: '🚀',
      chunks: [plain('Ship it '), found('🚀'), plain(' today')],
    },
    { case: 'text around an emoji', text: 'a😀b', term: 'b', chunks: [plain('a😀'), found('b')] },
    {
      case: 'half of an emoji that is two code points joined',
      text: 'Team 👩‍👩‍👧 offsite',
      term: '👩',
      chunks: [plain('Team '), found('👩‍👩‍👧'), plain(' offsite')],
    },
    {
      case: 'a letter and the accent that follows it',
      text: 'café ready',
      term: 'cafe',
      chunks: [found('café'), plain(' ready')],
    },
    {
      case: 'a capital that lowercases to two characters',
      text: 'İstanbul trip',
      term: 'trip',
      chunks: [plain('İstanbul '), found('trip')],
    },
    {
      case: '"<" and "&" as they are',
      text: 'R&D <b>plan</b>',
      term: '<b>',
      chunks: [plain('R&D '), found('<b>'), plain('plan</b>')],
    },
    { case: 'an ampersand', text: 'Fish & Chips', term: '&', chunks: [plain('Fish '), found('&'), plain(' Chips')] },
    {
      case: 'characters that mean something in a pattern',
      text: 'Save 50% (now) [x]',
      term: '50% (now)',
      chunks: [plain('Save '), found('50% (now)'), plain(' [x]')],
    },
    { case: 'an empty term', text: 'Weekly update', term: '', chunks: [plain('Weekly update')] },
    { case: 'an empty text', text: '', term: 'launch', chunks: [] },
    { case: 'a term longer than the text', text: 'to', term: 'tomorrow', chunks: [plain('to')] },
  ])('splits $case', ({ text, term, chunks }) => {
    expect(splitByTerm(text, term)).toEqual(chunks)
  })

  it.each([
    ['launch', 'Autumn launch plan, then launch'],
    ['', 'Weekly'],
    ['é', 'Un café, café y CAFÉ'],
    ['👩', '👩‍👩‍👧 y 👩 y 👨‍👩‍👧'],
    ['i', 'İstanbul, Italia'],
  ])('gives back the text itself when its chunks are joined (term %j)', (term, text) => {
    expect(
      splitByTerm(text, term)
        .map((chunk) => chunk.text)
        .join(''),
    ).toBe(text)
  })
})
