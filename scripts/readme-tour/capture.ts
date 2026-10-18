import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { repositoryRoot } from '../../apps/web/e2e-collab/environment.ts'

/** Where the files go: `docs/assets`, unless `TOUR_OUTPUT` says otherwise (to try the tour without touching the repository). */
export const outputDirectory = resolve(repositoryRoot, process.env.TOUR_OUTPUT ?? 'docs/assets')

mkdirSync(outputDirectory, { recursive: true })

/** One picture of the page as it is now, named after what it shows. Animations and the blinking caret would make two runs differ. */
export async function capture(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: resolve(outputDirectory, `${name}.png`),
    animations: 'disabled',
    caret: 'hide',
  })
}
