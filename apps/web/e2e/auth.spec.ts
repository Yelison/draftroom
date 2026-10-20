/* Signing up, signing out and signing in again on the production build with the mock data source, by keyboard alone. The
 * mock starts with Marta signed in, as it does for every other spec, so the sign-in screens are reached by signing out. */
import type { Page } from '@playwright/test'
import { marta } from '../src/data/mock/fixtures/index.ts'
import { expect, test } from './fixtures.ts'

test.use({ colorScheme: 'light' })

interface Words {
  locale: string
  signOut: string
  signIn: string
  signUp: string
  switchToSignUp: string
  switchToSignIn: string
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
  switchToSignUp: 'Create account',
  switchToSignIn: 'Sign in',
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
  switchToSignUp: 'Crear cuenta',
  switchToSignIn: 'Iniciar sesión',
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

      // The switch is ahead of the headline in the page, so one step back from the headline is the way to create an account.
      await page.keyboard.press('Shift+Tab')
      await expect(page.getByRole('link', { name: words.switchToSignUp })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/sign-up$/)
      await expect(page.getByRole('heading', { level: 1, name: words.signUp })).toBeFocused()

      // And back to signing in with the same switch: the open page is the step before the headline, the other one before it.
      await page.keyboard.press('Shift+Tab')
      await expect(page.getByRole('link', { name: words.switchToSignUp })).toHaveAttribute('aria-current', 'page')
      await page.keyboard.press('Shift+Tab')
      await expect(page.getByRole('link', { name: words.switchToSignIn })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/sign-in$/)
      await expect(page.getByRole('heading', { level: 1, name: words.signIn })).toBeFocused()
      await page.keyboard.press('Shift+Tab')
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
      await page.getByRole('link', { name: words.switchToSignUp }).click()
      await expect(page.getByRole('heading', { level: 1, name: words.signUp })).toBeVisible()

      await page.keyboard.press('Tab')
      await page.getByRole('button', { name: words.submitSignUp }).click()

      await expect(page.getByRole('textbox', { name: words.name })).toBeFocused()
      await expect(page.getByRole('textbox', { name: words.name })).toHaveAccessibleDescription(words.enterYourName)
      await expect(page.getByRole('textbox', { name: words.email })).toHaveAccessibleDescription(words.enterYourEmail)
      await expect(page.getByRole('alert').filter({ hasText: words.enterYourName })).toBeVisible()
    })

    test('fits a window of 640 × 360, the width a browser zoom of 200 % leaves, with the brand above the form', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 640, height: 360 })
      await page.goto('/')
      await signOut(page, words)

      for (const [heading, control] of [
        [words.signIn, page.getByRole('button', { name: words.signIn })],
        [words.signUp, page.getByRole('button', { name: words.submitSignUp })],
      ] as const) {
        if (heading === words.signUp) await page.getByRole('link', { name: words.switchToSignUp }).click()
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
        await control.scrollIntoViewIfNeeded()

        const sideways = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(sideways).toBeLessThanOrEqual(0)
        const brand = await page.getByText('Draftroom', { exact: true }).boundingBox()
        const form = await page.getByRole('textbox', { name: words.email }).boundingBox()
        expect(brand?.y).toBeLessThan(form?.y ?? 0)
        for (const box of [brand, form, await control.boundingBox()]) {
          expect(box?.x).toBeGreaterThanOrEqual(0)
          expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(640)
        }
      }
    })

    test('does not move the form when it sends, nor when the answer is a refusal', async ({ page }) => {
      // Every change of the form is measured as it happens: the sending and the refusal are there for a moment only.
      await page.addInitScript(() => {
        const seen = window as unknown as { samples?: { busy: boolean; tops: number[] }[] }
        seen.samples = []
        new MutationObserver(() => {
          const button = document.querySelector('main form button[type="submit"]')
          if (button === null) return
          const parts = ['main h1', 'main form input', 'main form input:nth-of-type(2)']
          seen.samples?.push({
            busy: button.getAttribute('aria-busy') === 'true',
            tops: [...parts.map((part) => document.querySelector(part)), button].map(
              (element) => element?.getBoundingClientRect().top ?? -1,
            ),
          })
        }).observe(document, { attributes: true, childList: true, subtree: true })
      })
      await page.goto('/')
      await signOut(page, words)

      await page.getByRole('textbox', { name: words.email }).fill(marta.email)
      await page.getByLabel(words.password).fill('not the password at all')
      await page.getByRole('button', { name: words.signIn }).click()
      await expect(page.getByRole('alert')).toBeVisible()

      const samples = await page.evaluate(
        () => (window as unknown as { samples: { busy: boolean; tops: number[] }[] }).samples,
      )
      expect(samples.some((sample) => sample.busy)).toBe(true)
      const [first] = samples
      for (const sample of samples) expect(sample.tops).toEqual(first?.tops)
    })
  })
}
