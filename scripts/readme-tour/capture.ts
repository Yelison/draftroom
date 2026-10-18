import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { repositoryRoot } from '../../apps/web/e2e-collab/environment.ts'
import type { Person } from './session.ts'

/** Where the files go: `docs/assets`, unless `TOUR_OUTPUT` says otherwise (to try the tour without touching the repository). */
export const outputDirectory = resolve(repositoryRoot, process.env.TOUR_OUTPUT ?? 'docs/assets')

mkdirSync(outputDirectory, { recursive: true })

/**
 * One picture of the person's page as it is now, named after what it shows, taken only if the content security policy has
 * refused nothing so far. Animations and the blinking caret would make two runs differ.
 */
export async function capture(person: Person, name: string): Promise<void> {
  await person.expectNoPolicyViolations()
  const { page } = person
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: resolve(outputDirectory, `${name}.png`),
    animations: 'disabled',
    caret: 'hide',
  })
}
