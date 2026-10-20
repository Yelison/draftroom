import type { Page } from '@playwright/test'

/** The person at the foot of the rail, which is the only button of the navigation: it opens the menu of the account. */
export const person = (page: Page) => page.getByRole('navigation').getByRole('button')

const items = (page: Page) => page.getByRole('menu').getByRole('menuitem')

/** Opens the menu of the account with the pointer. Its items are Settings and Sign out, in that order. */
export async function openAccountMenu(page: Page) {
  await person(page).click()
  await items(page).first().waitFor()
}

export async function openSettings(page: Page) {
  await openAccountMenu(page)
  await items(page).first().click()
  await page.getByRole('dialog').waitFor()
}

export async function signOut(page: Page) {
  await openAccountMenu(page)
  await items(page).last().click()
}
