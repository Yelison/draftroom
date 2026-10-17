import { contractLimits } from '@draftroom/contract'

export type BodyProblem = 'required' | 'tooLong'

/** What is wrong with the text of a comment, counted as the contract counts: in Unicode code points, after trimming. */
export function bodyProblem(text: string): BodyProblem | null {
  const length = [...text.trim()].length
  if (length < contractLimits.commentBody.min) return 'required'
  return length > contractLimits.commentBody.max ? 'tooLong' : null
}
