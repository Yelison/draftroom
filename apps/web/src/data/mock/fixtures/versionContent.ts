import type { JSONContent } from '@tiptap/core'
import { seedId } from '../ids.ts'

// What each stored version of the fixtures held. The mock stands in for the server, which keeps these as Yjs updates
// and serves them as such: `getVersionContent` writes them with `jsonToYUpdate` when a version is asked for.

const paragraph = (value: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text: value }] })
const heading = (value: string): JSONContent => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text: value }],
})
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })

/** Keyed by the id of the fixture version, the way `fixtures/collaboration.ts` numbers them. */
export const versionContent: Readonly<Record<string, JSONContent>> = {
  [seedId(7, 1)]: doc(
    heading('Autumn launch plan'),
    paragraph('The launch is planned for the first week of November.'),
    paragraph('Pricing is still open and nobody has reviewed the new tiers.'),
  ),
  [seedId(7, 2)]: doc(
    heading('Autumn launch plan'),
    paragraph('The launch moves to the second week of November.'),
    paragraph('Pricing will be reviewed before anything is announced.'),
  ),
  [seedId(7, 3)]: doc(
    heading('Autumn launch plan'),
    paragraph('The launch moves to the second week of November, once the pricing review is signed off.'),
    paragraph('Marketing prepares the announcement and support gets the new tiers a week earlier.'),
  ),
  [seedId(7, 4)]: doc(
    heading('Customer interview synthesis'),
    paragraph('Eight interviews, three themes: onboarding, sharing and the cost of switching.'),
  ),
}
