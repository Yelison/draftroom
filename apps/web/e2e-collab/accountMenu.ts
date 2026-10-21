import type { Page } from '@playwright/test'

/** The person at the foot of the rail, the only button of the navigation: they are in, and it opens the menu of the account. */
export const person = (page: Page) => page.getByRole('navigation').getByRole('button')

/** Signs out from the menu of the account: Settings is its first item and Sign out its last. */
export async function signOut(page: Page) {
  await person(page).click()
  await page.getByRole('menu').getByRole('menuitem').last().click()
}
