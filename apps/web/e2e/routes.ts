import { expect, type Page } from '@playwright/test'
import { launchPlan } from '../src/data/mock/fixtures/documents.ts'
import { openAccountMenu, openSettings, signOut as signOutFromMenu } from './accountMenu.ts'

/**
 * The screens and states the accessibility, overflow and zoom specs go through: one list, so a screen that is added is
 * checked by all of them. Each case gets the page to its screen and its state, and nothing here depends on the words of a
 * language: the pseudo-locale build puts other words in every label, and its cases are these.
 *
 * The paths have no leading slash, so they resolve against the `baseURL` of the project: the app at the root of the server,
 * or the pseudo-locale build in its own directory.
 */
export interface RouteCase {
  /** Names the case in the title of a test. */
  name: string
  /** Puts the page on the screen and in the state, and resolves once there is nothing left to arrive. */
  open: (page: Page) => Promise<void>
}

const headline = (page: Page) => page.getByRole('heading', { level: 1 }).first()

/** Where the app was loaded from, which is where its addresses start: the root of the server, or the pseudo-locale build. */
const homes = new WeakMap<Page, string>()

/**
 * Goes to an address of the app the way a person does after the page is open: the router moves, nothing is loaded again.
 * The first address loads the app. The pseudo-locale build lives in a directory of the server that has no fallback for an
 * address deeper than its own, so a screen of it can only be reached from inside, and the others are reached the same
 * way so that they are all measured as they are used.
 */
export async function visit(page: Page, path: string) {
  let home = homes.get(page)
  if (home === undefined) {
    await page.goto('')
    home = page.url()
    homes.set(page, home)
  }
  await page.evaluate((address) => {
    window.history.pushState(null, '', address)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, new URL(path, home).href)
}

/** The screen is there and nothing in it is still loading, so what is measured is the screen and not its skeleton. */
async function settled(page: Page) {
  await expect(headline(page)).toBeAttached()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
}

function screen(name: string, path: string): RouteCase {
  return {
    name,
    open: async (page) => {
      await visit(page, path)
      await settled(page)
    },
  }
}

/** The editor, with the comments panel as a person left it: the page remembers the choice, so it is set before the page opens. */
function editor(name: string, path: string, panel: 'open' | 'closed'): RouteCase {
  return {
    name,
    open: async (page) => {
      await page.addInitScript((choice) => localStorage.setItem('draftroom.commentsPanel', choice), panel)
      await visit(page, path)
      await page.locator('[contenteditable]').first().waitFor()
      await settled(page)
    },
  }
}

/** Signs out from the menu of the person at the foot of the rail. */
async function signOut(page: Page) {
  await visit(page, '')
  await settled(page)
  await signOutFromMenu(page)
  await expect(page).toHaveURL(/sign-in$/)
  await settled(page)
}

/**
 * A new account belongs to no workspace: the Documents screen says so. The mock keeps its state in the page, so the way
 * there is the person's own, by the screens, and not by an address that would start it over.
 */
async function openWithoutWorkspace(page: Page) {
  await signOut(page)
  await page.locator('a[href$="sign-up"]').click()
  await expect(page).toHaveURL(/sign-up$/)
  // The app puts the focus on the headline of a page it has opened; what is typed before that is lost with the form.
  await expect(headline(page)).toBeFocused()
  await page.getByRole('textbox').nth(0).fill('Lena Fischer')
  await page.getByRole('textbox').nth(1).fill('lena@harborpine.example')
  await page.locator('input[type="password"]').fill('a phrase of several words')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('navigation').locator('a[href$="/documents"]').click()
  await expect(page).toHaveURL(/documents$/)
  await settled(page)
  // The screen says there is nothing to list, and lists nothing: without this the case could be measuring another screen.
  await expect(page.getByRole('main').locator('a[href*="/documents/"]')).toHaveCount(0)
  await expect(page.getByRole('main').locator('li')).toHaveCount(0)
}

const document = `documents/${launchPlan.id}`

export const routes: readonly RouteCase[] = [
  screen('home', ''),
  screen('documents', 'documents'),
  screen('shared with me', 'shared'),
  screen('workspace history', 'history'),
  screen('members', 'members'),
  screen('trash', 'trash'),
  screen('search results', 'search?q=plan'),
  editor('editor with the comments panel open', document, 'open'),
  editor('editor with the comments panel closed', document, 'closed'),
  {
    name: 'share dialog',
    open: async (page) => {
      await page.addInitScript(() => localStorage.setItem('draftroom.commentsPanel', 'open'))
      await visit(page, `${document}/share`)
      await page.getByRole('dialog').waitFor()
      await settled(page)
    },
  },
  screen('version history', `${document}/versions`),
  {
    name: 'account menu',
    open: async (page) => {
      await visit(page, '')
      await settled(page)
      await openAccountMenu(page)
    },
  },
  {
    name: 'settings dialog over home',
    open: async (page) => {
      await visit(page, '')
      await settled(page)
      await openSettings(page)
      await expect(page.getByRole('dialog').locator('[aria-busy="true"]')).toHaveCount(0)
    },
  },
  {
    name: 'settings dialog over the editor',
    open: async (page) => {
      await page.addInitScript(() => localStorage.setItem('draftroom.commentsPanel', 'closed'))
      await visit(page, document)
      await page.locator('[contenteditable]').first().waitFor()
      await settled(page)
      await openSettings(page)
      await expect(page.getByRole('dialog').locator('[aria-busy="true"]')).toHaveCount(0)
    },
  },
  { name: 'sign in', open: signOut },
  {
    name: 'sign up',
    open: async (page) => {
      await signOut(page)
      await page.locator('a[href$="sign-up"]').click()
      await expect(page).toHaveURL(/sign-up$/)
      await settled(page)
    },
  },
  { name: 'documents of someone who belongs to no workspace', open: openWithoutWorkspace },
]

export const themes = ['light', 'dark'] as const
export const widths = [1280, 1440] as const
export const locales = ['en-US', 'es-ES'] as const

/**
 * What the specs that go through every route repeat it in. Whole, it is two themes, two languages and two widths, which
 * takes minutes: it runs when `E2E_MATRIX=full` says so (a job of its own in the CI). Without it, one theme and one
 * language, and both widths, so that a change is checked in the time a change deserves.
 */
export const matrix = {
  themes: process.env.E2E_MATRIX === 'full' ? themes : themes.slice(0, 1),
  locales: process.env.E2E_MATRIX === 'full' ? locales : locales.slice(0, 1),
  widths,
}
