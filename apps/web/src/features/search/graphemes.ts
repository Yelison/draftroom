/** What a person sees as one character (a letter and its accent, an emoji joined from several): the unit no cut may split. */
export const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
