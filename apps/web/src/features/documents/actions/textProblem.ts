export type TextProblem = 'required' | 'tooLong'

/** What is wrong with a name or a title, counted as the contract counts: in Unicode code points, after trimming. */
export function textProblem(text: string, limits: { min: number; max: number }): TextProblem | null {
  const length = [...text.trim()].length
  if (length < limits.min) return 'required'
  return length > limits.max ? 'tooLong' : null
}
