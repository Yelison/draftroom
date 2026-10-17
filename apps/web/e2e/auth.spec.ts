/* Signing up, signing out and signing in again on the production build with the mock data source, by keyboard alone. The
 * mock starts with Marta signed in, as it does for every other spec, so the sign-in screens are reached by signing out. */
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

test.use({ colorScheme: 'light' })

interface Words {
  locale: string
  signOut: string
  signIn: string
  signUp: string
  createAccount: string
  submitSignUp: string
  name: string
  email: string
  password: string
  home: string
  enterYourEmail: string
  enterYourName: string
  invalidEmail: string
}

const english: Words = {
  locale: 'en-US',
  signOut: 'Sign out',
  signIn: 'Sign in',
  signUp: 'Create your account',
  createAccount: 'Create an account',
  submitSignUp: 'Create account',
  name: 'Name',
  email: 'Email',
  password: 'Password',
  home: 'Home',
  enterYourEmail: 'Enter your email.',
  enterYourName: 'Enter your name.',
  invalidEmail: 'Enter an email like name@example.com.',
}

const spanish: Words = {
  locale: 'es-ES',
  signOut: 'Cerrar sesión',
  signIn: 'Iniciar sesión',
  signUp: 'Crea tu cuenta',
  createAccount: 'Crea una cuenta',
  submitSignUp: 'Crear cuenta',
  name: 'Nombre',
  email: 'Correo electrónico',
  password: 'Contraseña',
  home: 'Inicio',
  enterYourEmail: 'Escribe tu correo electrónico.',
  enterYourName: 'Escribe tu nombre.',
  invalidEmail: 'Escribe un correo como nombre@ejemplo.com.',
}

/**
 * Signing out is the last stop of the page in the Tab order, though it sits at the foot of the rail on screen: it is reached
 * with the Tab key from wherever the focus is, which after opening a page is its headline.
 */
async function tabToSignOut(page: Page, words: Words) {
  const button = page.getByRole('button', { name: words.signOut })
  await expect(button).toBeVisible()
  for (let stop = 0; stop < 100; stop++) {
    await page.keyboard.press('Tab')
    if (await button.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error(`The Tab key never reached "${words.signOut}"`)
}

async function signOut(page: Page, words: Words) {
  await tabToSignOut(page, words)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/sign-in$/)
  // The headline has the focus, which is what tells a screen reader that the page changed.
  await expect(page.getByRole('heading', { level: 1, name: words.signIn })).toBeFocused()
}

for (const words of [english, spanish]) {
  test.describe(`in ${words.locale}`, () => {
    test.use({ locale: words.locale })

    test('signs up, signs out and signs in again with the keyboard alone', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1, name: words.home })).toBeVisible()
      await signOut(page, words)

      // From the headline: the address, the password, the button, and the way to create an account.
      await page.keyboard.press('Tab')
      await expect(page.getByRole('textbox', { name: words.email })).toBeFocused()
      for (let stop = 0; stop < 3; stop++) await page.keyboard.press('Tab')
      await expect(page.getByRole('link', { name: words.createAccount })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/sign-up$/)
      await expect(page.getByRole('heading', { level: 1, name: words.signUp })).toBeFocused()

      await page.keyboard.press('Tab')
      await expect(page.getByRole('textbox', { name: words.name })).toBeFocused()
      await page.keyboard.type('Lena Fischer')
      await page.keyboard.press('Tab')
      await page.keyboard.type('lena@harborpine.example')
      await page.keyboard.press('Tab')
      await page.keyboard.type('a phrase of several words')
      await page.keyboard.press('Enter')

      await expect(page).toHaveURL(/\/$/)
      await expect(page.getByRole('heading', { level: 1, name: words.home })).toBeFocused()

      await signOut(page, words)
      await page.keyboard.press('Tab')
      await page.keyboard.type('lena@harborpine.example')
      await page.keyboard.press('Tab')
      await page.keyboard.type('a phrase of several words')
      await page.keyboard.press('Enter')

      await expect(page).toHaveURL(/\/$/)
      await expect(page.getByRole('button', { name: words.signOut })).toBeVisible()
    })

    test('says what is missing, as alerts tied to the fields, with the focus on the first', async ({ page }) => {
      await page.goto('/')
      await signOut(page, words)
      await page.getByRole('link', { name: words.createAccount }).click()
      await expect(page.getByRole('heading', { level: 1, name: words.signUp })).toBeVisible()

      await page.keyboard.press('Tab')
      await page.getByRole('button', { name: words.submitSignUp }).click()

      await expect(page.getByRole('textbox', { name: words.name })).toBeFocused()
      await expect(page.getByRole('textbox', { name: words.name })).toHaveAccessibleDescription(words.enterYourName)
      await expect(page.getByRole('textbox', { name: words.email })).toHaveAccessibleDescription(words.enterYourEmail)
      await expect(page.getByRole('alert').filter({ hasText: words.enterYourName })).toBeVisible()
    })
  })
}
