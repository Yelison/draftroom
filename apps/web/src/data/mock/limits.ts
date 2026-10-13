import { contractLimits } from '@draftroom/contract'
import type { TextLimits } from './text.ts'

/**
 * The limits of the contract's texts. The ones a form needs come from `contractLimits`; the rest (people, accounts) are
 * in the schemas of `openapi.yaml` and nowhere else, so a test of the mock pins them to it.
 */
export const textLimits = {
  documentTitle: contractLimits.documentTitle,
  commentBody: contractLimits.commentBody,
  quote: contractLimits.quote,
  folderName: contractLimits.folderName,
  workspaceName: contractLimits.workspaceName,
  versionLabel: contractLimits.versionLabel,
  personName: { min: 1, max: 80 },
  email: { min: 1, max: 254 },
  password: { min: 12, max: 128 },
  search: { min: 1, max: 200 },
} as const satisfies Record<string, TextLimits>
