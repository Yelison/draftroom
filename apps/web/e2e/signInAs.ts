import type { Page } from '@playwright/test'
import { daniel, demoPassword } from '../src/data/mock/fixtures/people.ts'
import { signOut } from './accountMenu.ts'
import { expect } from './fixtures.ts'

/** Marta owns every document, so nothing is shared with her: Daniel, who edits, comments on and reads hers, signs in. */
export async function signInAsDaniel(page: Page, path = '/') {
  await page.goto(path)
  await signOut(page)
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.getByRole('textbox', { name: 'Email' }).fill(daniel.email)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/$/)
}
