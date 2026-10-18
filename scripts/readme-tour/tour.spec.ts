import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { capture, outputDirectory } from './capture.ts'
import { commentOn, reply, threads } from './comments.ts'
import { Person } from './session.ts'
import { documentIdOf, english, makeColleagueEditor, spanish } from './scene.ts'

// The tour of the README: every picture is a screen of the real app with the demo seed, and a step that does not find what
// it expects fails by name instead of capturing a screen that is broken. `npm run docs:tour` runs it (see run.ts).

test.describe.configure({ mode: 'serial' })

const meetingNotes = [
  'Decision: the launch moves to the second week of November.',
  'Before then we need the price list and the press kit.',
]

const reunion = [
  'Decisión: la cosecha empieza la primera semana de octubre.',
  'Antes hay que revisar las prensas y cerrar las entregas.',
]

test('the screens of the app, in light and dark, in English and Spanish', async ({ browser }) => {
  const { owner, colleague } = english
  const documentId = await documentIdOf(english)
  await makeColleagueEditor(english, documentId)
  const daniel = await Person.signIn(browser, owner, { language: 'en', scheme: 'light', width: 1440 })
  const priya = await Person.signIn(browser, colleague, { language: 'en', scheme: 'light', width: 1440 })

  await test.step('home', async () => {
    await daniel.page.goto('/')
    await expect(daniel.page.getByRole('heading', { name: daniel.say('home.activity.title') })).toBeVisible()
    await expect(daniel.page.getByText(english.documentTitle).first()).toBeVisible()
    await capture(daniel.page, 'home')
  })

  await test.step('explorer', async () => {
    await daniel.page.goto('/documents')
    await expect(daniel.page.getByRole('heading', { level: 1, name: daniel.say('nav.documents') })).toBeVisible()
    await expect(daniel.page.getByText(english.documentTitle).first()).toBeVisible()
    await capture(daniel.page, 'explorer')
  })

  await test.step('editor with two people', async () => {
    // The second person arrives when there is text: two people who open an empty document together each start it with an empty
    // paragraph of their own, which is how the document begins and not how it is used.
    await daniel.openDocument(documentId)
    await daniel.typeAtEnd(meetingNotes[0] ?? '')
    await priya.openDocument(documentId)
    await expect(daniel.presenceOf(colleague.name)).toBeVisible()
    await expect(priya.editor).toContainText(meetingNotes[0] ?? '')
    await priya.typeAtEnd(meetingNotes[1] ?? '', { newParagraph: true })
    await expect(daniel.editor).toContainText(meetingNotes[1] ?? '')
    await expect(daniel.syncedStatus).toBeAttached()
    await capture(daniel.page, 'editor')
  })

  await test.step('comments', async () => {
    await commentOn(priya, 'second week of November', 'Can we confirm that date with the press team?')
    await expect(threads(daniel)).toHaveCount(1)
    await reply(daniel, "Yes, I'll ask them on Monday.")
    await expect(threads(priya).first().getByText("Yes, I'll ask them on Monday.")).toBeVisible()
    await capture(daniel.page, 'comments')
  })

  await test.step('sharing', async () => {
    await daniel.page.getByRole('button', { name: daniel.say('sharing.button') }).click()
    const dialog = daniel.page.getByRole('dialog', { name: `Share “${english.documentTitle}”` })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(colleague.name, { exact: true })).toBeVisible()
    await capture(daniel.page, 'share')
    await daniel.page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  await test.step('version history', async () => {
    await daniel.page.getByRole('button', { name: daniel.say('versions.link') }).click()
    await daniel.page.getByRole('button', { name: daniel.say('versions.save.button') }).click()
    const dialog = daniel.page.getByRole('dialog', { name: daniel.say('versions.save.title') })
    await dialog.getByLabel(daniel.say('versions.save.label')).fill('Ready for review')
    await dialog.getByRole('button', { name: daniel.say('versions.save.action') }).click()
    await expect(dialog).toBeHidden()
    const version = daniel.page
      .getByRole('region', { name: daniel.say('versions.list.label') })
      .getByRole('button', { name: /^Ready for review/ })
    await version.click()
    await expect(daniel.page.getByText(meetingNotes[0] ?? '').first()).toBeVisible()
    await capture(daniel.page, 'versions')
  })

  await test.step('the same screen in dark', async () => {
    const dark = await Person.signIn(browser, owner, { language: 'en', scheme: 'dark', width: 1440 })
    await dark.openDocument(documentId)
    await expect(dark.presenceOf(colleague.name)).toBeVisible()
    await expect(dark.editor).toContainText(meetingNotes[1] ?? '')
    await capture(dark.page, 'editor-dark')
    await dark.close()
  })

  await test.step('settings', async () => {
    const narrow = await Person.signIn(browser, owner, { language: 'en', scheme: 'light', width: 1280 })
    await narrow.page.goto('/settings/appearance')
    await expect(narrow.page.getByRole('heading', { name: narrow.say('settings.appearance.title') })).toBeVisible()
    await capture(narrow.page, 'settings')
    await narrow.close()
  })

  await priya.close()
  await daniel.close()

  await test.step('the same screen in Spanish', async () => {
    const spanishId = await documentIdOf(spanish)
    const lucia = await Person.signIn(browser, spanish.owner, { language: 'es', scheme: 'light', width: 1440 })
    const mateo = await Person.signIn(browser, spanish.colleague, { language: 'es', scheme: 'light', width: 1440 })
    await lucia.openDocument(spanishId)
    await lucia.typeAtEnd(reunion[0] ?? '')
    await mateo.openDocument(spanishId)
    await expect(lucia.presenceOf(spanish.colleague.name)).toBeVisible()
    await expect(mateo.editor).toContainText(reunion[0] ?? '')
    await mateo.typeAtEnd(reunion[1] ?? '', { newParagraph: true })
    await expect(lucia.editor).toContainText(reunion[1] ?? '')
    await expect(lucia.syncedStatus).toBeAttached()
    await capture(lucia.page, 'editor-es')
    await mateo.close()
    await lucia.close()
  })
})

// The clip is what one of the two browsers shows: the other person's text arrives, and then their comment. Two recordings cannot be
// joined without a tool the repository does not have, and one browser that shows both people at work says it as well.
test('a short video of two people writing and one commenting', async ({ browser }, testInfo) => {
  const { colleague } = english
  const documentId = await documentIdOf({ ...english, documentTitle: 'Brand voice guidelines' })
  const watcher = await Person.signIn(browser, english.owner, {
    language: 'en',
    scheme: 'light',
    width: 1280,
    recordTo: testInfo.outputPath('video'),
  })
  const writer = await Person.signIn(browser, colleague, { language: 'en', scheme: 'light', width: 1280 })
  const started = Date.now()
  const pause = (milliseconds: number) => watcher.page.waitForTimeout(milliseconds)

  await watcher.openDocument(documentId)
  await watcher.typeAtEnd('We write the way we talk to a friend.')
  await writer.openDocument(documentId)
  await expect(watcher.presenceOf(colleague.name)).toBeVisible()
  await pause(800)
  await writer.typeAtEnd('Short sentences, plain words, no jargon.', { newParagraph: true })
  await expect(watcher.editor).toContainText('no jargon.')
  await pause(1200)
  await commentOn(writer, 'plain words', 'Add two examples here?')
  await expect(threads(watcher)).toHaveCount(1)
  await pause(2500)

  const seconds = (Date.now() - started) / 1000
  const video = resolve(outputDirectory, 'tour.webm')
  await writer.close()
  await watcher.close(video)
  expect(seconds, 'the clip is meant to be short').toBeLessThan(28)
  expect(statSync(video).size, 'the clip is meant to be small').toBeLessThan(5 * 1024 * 1024)
})
