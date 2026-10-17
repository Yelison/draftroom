/** The text cut to a number of Unicode code points, which is how the contract counts: an emoji is one, though it is two UTF-16 units. */
export const clipToCodePoints = (text: string, max: number) => {
  const points = [...text]
  return points.length <= max ? text : points.slice(0, max).join('')
}
