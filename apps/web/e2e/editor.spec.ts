/* The editor in the production build, with a real browser: typing, the keyboard, the clipboard, the focus and the layout. */
import { test as unwatched, type Locator, type Page } from '@playwright/test'
import { launchPlan } from '../src/data/mock/fixtures/documents.ts'
import { googleDocs, word } from '../src/features/editor/testing/wordProcessorHtml.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light' })

const documentPath = `/documents/${launchPlan.id}`
const missingPath = '/documents/00000000-0000-4000-8000-0000000000ff'

const textArea = (page: Page) => page.getByRole('textbox', { name: /Document content|Contenido del documento/ })
const toolbarButton = (page: Page, name: string) => page.getByRole('toolbar').getByRole('button', { name, exact: true })

/** Opens the launch plan and puts the caret in its empty text. */
async function open(page: Page, path = documentPath) {
  await page.goto(path)
  const text = textArea(page)
  await text.waitFor()
  await text.click()
  return text
}

/** Types a line and selects it, ready for a format. */
async function typeAndSelect(page: Page, line = 'Some words') {
  await page.keyboard.type(line)
  await page.keyboard.press('ControlOrMeta+A')
}

/** What each format looks like in the page, how the toolbar names it and the keys that apply it. */
const formats = [
  { name: 'Bold', selector: 'p > strong', keys: 'ControlOrMeta+B' },
  { name: 'Italic', selector: 'p > em', keys: 'ControlOrMeta+I' },
  { name: 'Code', selector: 'p > code', keys: 'ControlOrMeta+E' },
  { name: 'Heading 2', selector: 'h2', keys: 'ControlOrMeta+Alt+2' },
  { name: 'Heading 3', selector: 'h3', keys: 'ControlOrMeta+Alt+3' },
  { name: 'Bulleted list', selector: 'ul > li > p', keys: 'ControlOrMeta+Shift+8' },
  { name: 'Numbered list', selector: 'ol > li > p', keys: 'ControlOrMeta+Shift+7' },
] as const

test.describe('formatting', () => {
  for (const { name, selector, keys } of formats) {
    test(`applies ${name} with the toolbar, and the button says it is pressed`, async ({ page }) => {
      const text = await open(page)
      await typeAndSelect(page)

      await toolbarButton(page, name).click()

      await expect(text.locator(selector)).toHaveText('Some words')
      await expect(toolbarButton(page, name)).toHaveAttribute('aria-pressed', 'true')
      // The text keeps the focus: the person can go on typing.
      await expect(text).toBeFocused()
    })

    test(`applies ${name} with ${keys}`, async ({ page }) => {
      const text = await open(page)
      await typeAndSelect(page)

      await page.keyboard.press(keys)

      await expect(text.locator(selector)).toHaveText('Some words')
      await expect(toolbarButton(page, name)).toHaveAttribute('aria-pressed', 'true')
    })
  }

  test('types in what was just turned on, and stops when it is turned off', async ({ page }) => {
    const text = await open(page)

    await page.keyboard.type('plain ')
    await page.keyboard.press('ControlOrMeta+B')
    await page.keyboard.type('strong')
    await page.keyboard.press('ControlOrMeta+B')
    await page.keyboard.type(' plain again')

    await expect(text.locator('p')).toHaveText('plain strong plain again')
    await expect(text.locator('strong')).toHaveText('strong')
  })

  test('has no formats the schema does not: no underline, strike-through, quote or code block', async ({ page }) => {
    const text = await open(page)
    await typeAndSelect(page)

    for (const keys of ['ControlOrMeta+U', 'ControlOrMeta+Shift+S', 'ControlOrMeta+Shift+B', 'ControlOrMeta+Alt+C']) {
      await page.keyboard.press(keys)
    }

    await expect(text.locator('u, s, del, blockquote, pre, hr, br:not(.ProseMirror-trailingBreak)')).toHaveCount(0)
  })

  test('turns a list into paragraphs again with the same button', async ({ page }) => {
    const text = await open(page)
    await typeAndSelect(page)
    await toolbarButton(page, 'Bulleted list').click()
    await expect(text.locator('ul')).toHaveCount(1)

    await toolbarButton(page, 'Bulleted list').click()

    await expect(text.locator('ul')).toHaveCount(0)
    await expect(text.locator('p')).toHaveText('Some words')
  })
})

test.describe('undo', () => {
  test('reverts the last change and redoes it, in steps of what was typed together', async ({ page }) => {
    const text = await open(page)
    await page.keyboard.type('first')
    // The undo manager groups what is typed within half a second; a pause makes the next words a step of their own.
    await page.waitForTimeout(700)
    await page.keyboard.type(' second')
    await expect(text.locator('p')).toHaveText('first second')

    await page.keyboard.press('ControlOrMeta+Z')
    await expect(text.locator('p')).toHaveText('first')

    await page.keyboard.press('ControlOrMeta+Shift+Z')
    await expect(text.locator('p')).toHaveText('first second')

    await page.keyboard.press('ControlOrMeta+Z')
    await page.keyboard.press('ControlOrMeta+Z')
    await expect(text.locator('p')).toHaveText('')
  })

  test('reverts a format too', async ({ page }) => {
    const text = await open(page)
    await typeAndSelect(page)
    await page.waitForTimeout(700)
    await toolbarButton(page, 'Bold').click()
    await expect(text.locator('strong')).toHaveCount(1)

    await page.keyboard.press('ControlOrMeta+Z')

    await expect(text.locator('strong')).toHaveCount(0)
    await expect(text.locator('p')).toHaveText('Some words')
  })

  // Chromium sends the text area the browser's own undo when Ctrl+Z is pressed in a field that has nothing to undo.
  test('does not change the text from the title: Ctrl+Z there leaves the body and the focus alone', async ({
    page,
  }) => {
    const text = await open(page)
    await page.keyboard.type('Body words')
    await page.waitForTimeout(700)
    const title = page.getByRole('textbox', { name: 'Document title' })
    await title.click()

    await page.keyboard.press('ControlOrMeta+Z')

    await expect(text.locator('p')).toHaveText('Body words')
    await expect(title).toBeFocused()
  })

  test('undoes what was typed in the title, and only that', async ({ page }) => {
    const text = await open(page)
    await page.keyboard.type('Body words')
    await page.waitForTimeout(700)
    const title = page.getByRole('textbox', { name: 'Document title' })
    await title.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' extra')
    await expect(title).toHaveValue('Autumn launch plan extra')

    await page.keyboard.press('ControlOrMeta+Z')

    await expect(title).toHaveValue('Autumn launch plan')
    await expect(text.locator('p')).toHaveText('Body words')
    await expect(title).toBeFocused()
  })
})

/** Pastes through a real paste event, as the browser makes one from the clipboard. */
async function paste(text: Locator, html: string, plain = '') {
  await text.evaluate(
    (element, { html, plain }) => {
      const data = new DataTransfer()
      if (html) data.setData('text/html', html)
      data.setData('text/plain', plain)
      element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    },
    { html, plain },
  )
}

test.describe('pasting', () => {
  // `window.pwned` is set by every payload that gets to run; nothing may.
  const cases = [
    { name: 'a script', html: '<p>safe</p><script>window.pwned = true</script>', text: 'safe' },
    {
      name: 'an image with an error handler',
      html: '<p>safe</p><img src="x" onerror="window.pwned = true">',
      text: 'safe',
    },
    {
      name: 'a handler on a paragraph',
      html: '<p onmouseover="window.pwned = true" onclick="window.pwned = true">safe</p>',
      text: 'safe',
    },
    { name: 'an SVG with a handler', html: '<p>safe</p><svg onload="window.pwned = true"></svg>', text: 'safe' },
    {
      name: 'an iframe',
      html: '<p>safe</p><iframe srcdoc="<script>parent.pwned = true</script>"></iframe>',
      text: 'safe',
    },
    {
      name: 'a style attribute and a style element',
      html: '<style>p { display: none }</style><p style="position: fixed">safe</p>',
      text: 'safe',
    },
    { name: 'a javascript: link', html: '<p><a href="javascript:window.pwned = true">safe</a></p>', text: 'safe' },
    {
      name: 'a javascript: link in mixed case with a tab',
      html: '<p><a href="JaVa&#9;ScRiPt:window.pwned = true">safe</a></p>',
      text: 'safe',
    },
    {
      name: 'a data: link',
      html: '<p><a href="data:text/html,<script>window.pwned = true</script>">safe</a></p>',
      text: 'safe',
    },
  ] as const

  for (const { name, html, text: expected } of cases) {
    // The page of this suite fails a test for any console error. Here the browser may report one thing: Chromium's
    // `script-src-attr` violation ("Executing inline event handler violates..."), which it raises when it creates the
    // handler in the inert document ProseMirror reads the pasted HTML into. Nothing runs (`pwned` stays false below). Any
    // other report still fails the test, a refused inline script among them: that would mean markup reached the live page.
    unwatched(`keeps only the text of ${name}, with nothing that runs and no link`, async ({ page }) => {
      const problems: string[] = []
      page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() === 'error' && !/Executing inline event handler violates/.test(message.text()))
          problems.push(`console.error: ${message.text()}`)
      })
      const text = await open(page)

      await paste(text, html)

      await expect(text.locator('p')).toHaveText(expected)
      expect(await text.innerHTML()).not.toMatch(
        /<script|<img|<svg|<iframe|onerror|onload|onclick|onmouseover|style=|href="(javascript|data)/i,
      )
      await expect(text.locator('a')).toHaveCount(0)
      expect(await page.evaluate(() => 'pwned' in window)).toBe(false)
      expect(problems, 'errors the browser reported while the test ran').toEqual([])
    })
  }

  test('keeps an address that is allowed, as a link that opens safely', async ({ page }) => {
    const text = await open(page)

    await paste(text, '<p><a href="https://example.com/page" target="_top" rel="opener" class="x">safe</a></p>')

    const anchor = text.locator('a')
    await expect(anchor).toHaveText('safe')
    await expect(anchor).toHaveAttribute('href', 'https://example.com/page')
    await expect(anchor).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(anchor).toHaveAttribute('target', '_blank')
    await expect(anchor).not.toHaveAttribute('class', 'x')
  })

  for (const { name, context } of [
    { name: 'a heading of level 1', context: ['heading', { level: 1 }] },
    { name: 'a heading of level 7', context: ['heading', { level: 7 }] },
    { name: 'a heading whose level is text', context: ['heading', { level: 'x onclick=1' }] },
  ]) {
    test(`leaves of a clipboard slice that names ${name} plain text, not a heading`, async ({ page }) => {
      const text = await open(page)
      const slice = JSON.stringify(context).replaceAll('"', '&quot;')

      await paste(text, `<span data-pm-slice="0 0 ${slice}">Hello</span>`)

      await expect(text.locator('p')).toHaveText('Hello')
      await expect(text.locator('h1, h2, h3, h4, h5, h6')).toHaveCount(0)
    })
  }

  test('keeps a clipboard slice that names a heading the schema has', async ({ page }) => {
    const text = await open(page)

    await paste(text, '<span data-pm-slice="0 0 [&quot;heading&quot;,{&quot;level&quot;:3}]">Hello</span>')

    await expect(text.locator('h3')).toHaveText('Hello')
  })

  test('takes a paste from Google Docs for what it is: only the bold text is bold, lists and all', async ({ page }) => {
    const text = await open(page)

    await paste(text, googleDocs)

    await expect(text.locator('h2')).toHaveText('Heading')
    await expect(text.locator('p').first()).toHaveText('Plain Bold Italic')
    await expect(text.locator('strong')).toHaveText('Bold')
    await expect(text.locator('em')).toHaveText('Italic')
    await expect(text.locator('ul > li')).toHaveCount(2)
  })

  test('reads the bold and the italic of Word', async ({ page }) => {
    const text = await open(page)

    await paste(text, word)

    await expect(text.locator('strong')).toHaveText(['Bold words', 'a b tag'])
    await expect(text.locator('em')).toHaveText('italic words')
    await expect(text.locator('p')).toHaveText('Bold words and italic words and a b tag and plain')
  })

  test('keeps headings, formats and lists from another page, and turns what the schema lacks into text', async ({
    page,
  }) => {
    const text = await open(page)

    await paste(
      text,
      '<h1>Big</h1><h2>Heading</h2><p><strong>b</strong> <u>u</u></p><blockquote><p>quote</p></blockquote><table><tr><td>cell</td></tr></table><ul><li>item</li></ul>',
    )

    await expect(text.locator('h1, blockquote, table, u')).toHaveCount(0)
    await expect(text.locator('h2')).toHaveText('Heading')
    await expect(text.locator('strong')).toHaveText('b')
    await expect(text.locator('ul > li')).toHaveText('item')
    await expect(text).toContainText('Big')
    await expect(text).toContainText('quote')
    await expect(text).toContainText('cell')
  })

  test('pastes plain text as the text it is', async ({ page }) => {
    const text = await open(page)

    await paste(text, '', '<script>window.pwned = true</script> and <b>not bold</b>')

    await expect(text.locator('p')).toHaveText('<script>window.pwned = true</script> and <b>not bold</b>')
    await expect(text.locator('b, script')).toHaveCount(0)
    expect(await page.evaluate(() => 'pwned' in window)).toBe(false)
  })
})

test.describe('links', () => {
  test('opens a dialog with the address field focused, links the selection and gives the focus back to the text', async ({
    page,
  }) => {
    const text = await open(page)
    await typeAndSelect(page, 'Read the plan')

    await toolbarButton(page, 'Link').click()

    const dialog = page.getByRole('dialog', { name: 'Add a link' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Link address')).toBeFocused()
    await dialog.getByLabel('Link address').fill('example.com/plan')
    await dialog.getByRole('button', { name: 'Add link' }).click()

    await expect(dialog).toBeHidden()
    const anchor = text.locator('a')
    await expect(anchor).toHaveText('Read the plan')
    await expect(anchor).toHaveAttribute('href', 'https://example.com/plan')
    await expect(anchor).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(anchor).toHaveAttribute('target', '_blank')
    await expect(page.getByRole('status').filter({ hasText: 'Link added' })).toHaveCount(1)
    // The mouse never took the focus from the text, so that is where the dialog gives it back: the person goes on typing.
    await expect(text).toBeFocused()
  })

  test('gives the focus back to the button when a key on the button opened the dialog', async ({ page }) => {
    await open(page)
    await typeAndSelect(page, 'Read the plan')
    const trigger = toolbarButton(page, 'Link')
    await trigger.focus()

    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Add a link' })
    await expect(dialog.getByLabel('Link address')).toBeFocused()
    await page.keyboard.press('Escape')

    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('keeps the dialog open and says why when the address is not a web or mail address', async ({ page }) => {
    const text = await open(page)
    await typeAndSelect(page, 'Read the plan')
    await toolbarButton(page, 'Link').click()
    const dialog = page.getByRole('dialog', { name: 'Add a link' })

    await dialog.getByLabel('Link address').fill('javascript:alert(1)')
    await dialog.getByRole('button', { name: 'Add link' }).click()

    await expect(dialog.getByRole('alert')).toHaveText(
      'Enter a web address that starts with http:// or https://, or an email address.',
    )
    await expect(dialog.getByLabel('Link address')).toBeFocused()
    await expect(dialog.getByLabel('Link address')).toHaveAttribute('aria-invalid', 'true')
    await expect(text.locator('a')).toHaveCount(0)
  })

  test('opens with Ctrl+K from the text, closes with Escape and returns to the text', async ({ page }) => {
    const text = await open(page)
    await typeAndSelect(page, 'Read the plan')

    await page.keyboard.press('ControlOrMeta+K')
    const dialog = page.getByRole('dialog', { name: 'Add a link' })
    await expect(dialog.getByLabel('Link address')).toBeFocused()
    await page.keyboard.press('Escape')

    await expect(dialog).toBeHidden()
    await expect(text).toBeFocused()
    await expect(text.locator('a')).toHaveCount(0)
  })

  test('keeps the focus away from the page behind while the dialog is open', async ({ page }) => {
    await open(page)
    await typeAndSelect(page, 'Read the plan')
    await toolbarButton(page, 'Link').click()
    const dialog = page.getByRole('dialog', { name: 'Add a link' })

    // After the last button of a modal dialog the browser moves the focus on to its own controls, which shows as the body.
    for (let press = 0; press < 6; press++) {
      await page.keyboard.press('Tab')
      const where = await dialog.evaluate((element) =>
        element.contains(document.activeElement) ? 'dialog' : (document.activeElement?.tagName ?? 'none'),
      )
      expect(['dialog', 'BODY']).toContain(where)
    }
  })

  test('edits and removes a link from the text it is in', async ({ page }) => {
    const text = await open(page)
    await typeAndSelect(page, 'Read the plan')
    await page.keyboard.press('ControlOrMeta+K')
    await page.getByLabel('Link address').fill('https://example.com/one')
    await page.keyboard.press('Enter')
    await expect(text.locator('a')).toHaveAttribute('href', 'https://example.com/one')

    await text.locator('a').click()
    await expect(toolbarButton(page, 'Link')).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('ControlOrMeta+K')
    const dialog = page.getByRole('dialog', { name: 'Edit link' })
    await expect(dialog.getByLabel('Link address')).toHaveValue('https://example.com/one')
    await dialog.getByLabel('Link address').fill('https://example.com/two')
    await dialog.getByRole('button', { name: 'Update link' }).click()
    await expect(text.locator('a')).toHaveAttribute('href', 'https://example.com/two')

    await text.locator('a').click()
    await page.keyboard.press('ControlOrMeta+K')
    await page.getByRole('button', { name: 'Remove link' }).click()

    await expect(text.locator('a')).toHaveCount(0)
    await expect(text.locator('p')).toHaveText('Read the plan')
    await expect(page.getByRole('status').filter({ hasText: 'Link removed' })).toHaveCount(1)
  })

  test('does not follow a link while editing: clicking it only puts the caret in it', async ({ page }) => {
    const text = await open(page)
    await typeAndSelect(page, 'Read the plan')
    await page.keyboard.press('ControlOrMeta+K')
    await page.getByLabel('Link address').fill('https://example.com/one')
    await page.keyboard.press('Enter')

    await text.locator('a').click()

    await expect(page).toHaveURL(documentPath)
  })
})

test.describe('the title', () => {
  const title = (page: Page) => page.getByRole('textbox', { name: 'Document title' })

  test('renames the document, and the new title is there when the document is opened again', async ({ page }) => {
    await open(page)

    await title(page).fill('Winter launch plan')
    await title(page).press('Enter')
    await expect(textArea(page)).toBeFocused()
    await expect(page).toHaveTitle('Winter launch plan · Draftroom')

    // To another page and back by the rail, inside the app, where the mock keeps its data.
    await page.getByRole('link', { name: 'Home' }).click()
    await page.goBack()
    await expect(title(page)).toHaveValue('Winter launch plan')
  })

  test('asks for a title when it is emptied, announces it and keeps the field', async ({ page }) => {
    await open(page)

    await title(page).fill('')
    await title(page).press('Tab')

    await expect(page.getByRole('alert')).toHaveText('Give the document a title.')
    await expect(title(page)).toHaveAttribute('aria-invalid', 'true')
  })

  test('stops at 200 characters, counting an emoji as one', async ({ page }) => {
    await open(page)

    await title(page).fill('😀'.repeat(200))
    await expect(page.getByRole('alert')).toHaveCount(0)
    await title(page).fill('😀'.repeat(230))

    expect([...(await title(page).inputValue())]).toHaveLength(200)
    await expect(page.getByRole('alert')).toHaveText('A title can have up to 200 characters.')
  })

  test('says nothing about being saved', async ({ page }) => {
    await open(page)

    await title(page).fill('Winter launch plan')
    await title(page).press('Tab')

    await expect(page.getByText(/saved/i)).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})

test.describe('a document that is not there', () => {
  test('says so in English, with a way back, and no editor', async ({ page }) => {
    await page.goto(missingPath)

    await expect(page.getByRole('heading', { level: 1, name: "This document isn't available" })).toBeVisible()
    // Visible for real, not the one-pixel clip of a heading that is only there for a screen reader.
    expect((await page.getByRole('heading', { level: 1 }).boundingBox())?.width).toBeGreaterThan(200)
    await expect(page.getByText('It may have been deleted, or you may not have access to it.')).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(page).toHaveTitle("This document isn't available · Draftroom")
    await page.getByRole('link', { name: 'Go to Documents' }).click()
    await expect(page).toHaveURL('/documents')
  })

  test.describe('in Spanish', () => {
    test.use({ locale: 'es-ES' })

    test('says so in Spanish', async ({ page }) => {
      await page.goto(missingPath)

      await expect(page.getByRole('heading', { level: 1, name: 'Este documento no está disponible' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Ir a Documentos' })).toBeVisible()
    })

    test('names the toolbar and its buttons in Spanish', async ({ page }) => {
      await page.goto(documentPath)

      await expect(page.getByRole('toolbar', { name: 'Formato' })).toBeVisible()
      for (const name of [
        'Negrita',
        'Cursiva',
        'Código',
        'Encabezado 2',
        'Encabezado 3',
        'Lista con viñetas',
        'Lista numerada',
        'Enlace',
      ]) {
        await expect(page.getByRole('toolbar').getByRole('button', { name, exact: true })).toBeVisible()
      }
      await expect(page.getByRole('textbox', { name: 'Título del documento' })).toBeVisible()
    })
  })
})

test.describe('the keyboard and the focus', () => {
  test('puts the focus on the headline of the document when it is opened from inside the app, and keeps it there', async ({
    page,
  }) => {
    await page.goto('/documents')
    await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible()

    // The explorer that will link to documents is not built yet: the browser's own history is how the app is navigated here.
    await page.evaluate((path) => {
      window.history.pushState({}, '', path)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, documentPath)

    const headline = page.getByRole('heading', { level: 1, name: launchPlan.title })
    await expect(headline).toBeFocused()
    await textArea(page).waitFor()
    await expect(headline).toBeFocused()
  })

  test('reaches the toolbar once, moves along it with the arrows and shows a ring on the focused button', async ({
    page,
  }) => {
    await page.goto(documentPath)
    await textArea(page).waitFor()
    await page.getByRole('textbox', { name: 'Document title' }).focus()

    // What the bar has for the comments sits between the toolbar and the title: the button of the margin, the selected tab and
    // the three choices of the filter.
    await page.keyboard.press('Shift+Tab')
    await expect(commentsToggle(page)).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(page.getByRole('tab', { name: 'Comments' })).toBeFocused()
    for (const choice of [/^All \(/, /^Resolved \(/, /^Open \(/]) {
      await page.keyboard.press('Shift+Tab')
      await expect(page.getByRole('button', { name: choice })).toBeFocused()
    }
    await page.keyboard.press('Shift+Tab')
    await expect(toolbarButton(page, 'Bold')).toBeFocused()
    await expect(toolbarButton(page, 'Bold')).toHaveCSS('outline-style', 'solid')
    await page.keyboard.press('ArrowRight')
    await expect(toolbarButton(page, 'Italic')).toBeFocused()
    await page.keyboard.press('End')
    await expect(toolbarButton(page, 'Link')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: /^Open \(/ })).toBeFocused()

    // The history and Share are in the band, above the toolbar.
    // The toolbar is one stop, wherever in it the person was: leaving it backwards goes to Share.
    await toolbarButton(page, 'Link').focus()
    await page.keyboard.press('Shift+Tab')
    await expect(page.getByRole('button', { name: 'Share' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(page.getByRole('button', { name: 'Version history' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(page.getByRole('navigation', { name: 'Where the document is' }).getByRole('link')).toBeFocused()
  })

  test('shows the shortcut in a tooltip on the keyboard focus and hides it with Escape', async ({ page }) => {
    await page.goto(documentPath)
    await textArea(page).waitFor()
    await page.getByRole('textbox', { name: 'Document title' }).focus()

    for (let stop = 0; stop < 6; stop++) await page.keyboard.press('Shift+Tab')

    await expect(page.getByRole('tooltip')).toHaveText(/^Bold \((Ctrl|⌘)\+?B\)$/)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  })

  test('is reachable end to end with the keyboard, in reading order', async ({ page }) => {
    await page.goto(documentPath)
    await textArea(page).waitFor()
    // The explorer's sections arrive with its data; the Tab key finds them where they will be.
    await page.getByRole('button', { name: 'Pinned' }).waitFor()
    // The count of open threads is in the name of the button once the threads have arrived.
    await expect(page.getByRole('button', { name: 'Comments, 1 open' })).toBeVisible()

    const stops: (string | null)[] = []
    const inExplorer: boolean[] = []
    for (let press = 0; press < 80 && stops.at(-1) !== 'Document content'; press++) {
      await page.keyboard.press('Tab')
      stops.push(
        await page.evaluate(() => {
          const focused = document.activeElement
          if (focused === null || focused === document.body) return null
          return (
            focused.getAttribute('aria-label') ??
            (focused as HTMLInputElement).labels?.[0]?.textContent ??
            focused.textContent?.trim() ??
            ''
          )
        }),
      )
      inExplorer.push(
        await page.evaluate(() => document.activeElement?.closest('aside[aria-label="Explorer"]') != null),
      )
    }

    // The explorer has a stop for each control of the sections that are open: where it starts and that it is whole is what is fixed.
    const rail = ['Skip to content', 'Home', 'Documents', 'Shared', 'History', 'Members', 'Settings', 'Sign out']
    const explorerStart = ['Search documents', 'New document', 'More', 'Pinned']
    expect(stops.slice(0, rail.length + explorerStart.length)).toEqual([...rail, ...explorerStart])
    const fromBand = stops.lastIndexOf('Product')
    expect(fromBand).toBeGreaterThan(rail.length + explorerStart.length)
    expect(inExplorer.slice(rail.length, fromBand).every(Boolean)).toBe(true)
    expect(stops.slice(fromBand)).toEqual([
      // The band: the folder of the document, its history and sharing.
      'Product',
      'Version history',
      'Share',
      // The bar: the toolbar is one stop, the filter, the selected tab and the button of the margin.
      'Bold',
      'Open (1)',
      'Resolved (1)',
      'All (2)',
      'Comments',
      'Comments, 1 open',
      'Document title',
      'Document content',
    ])
  })
})

/** The sum of the layout shifts the page has had since it loaded, which the browser measures. */
const shifts = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean }
            if (!shift.hadRecentInput) total += shift.value
          }
        })
        observer.observe({ type: 'layout-shift', buffered: true })
        setTimeout(() => resolve(total), 500)
      }),
  )

test.describe('the code mark', () => {
  const plain = 'Run it again today'
  const heights = (blocks: Locator) =>
    blocks.evaluateAll((elements) => elements.map((e) => e.getBoundingClientRect().height))

  /** Types a line, with `it` in code when asked. */
  async function typeLine(page: Page, withCode: boolean) {
    if (!withCode) return page.keyboard.type(plain)
    await page.keyboard.type('Run ')
    await page.keyboard.press('ControlOrMeta+E')
    await page.keyboard.type('it')
    await page.keyboard.press('ControlOrMeta+E')
    await page.keyboard.type(' again today')
  }

  test('does not make a line taller than the same line without it, in a paragraph or in a title', async ({ page }) => {
    const text = await open(page)
    await typeLine(page, false)
    await page.keyboard.press('Enter')
    await typeLine(page, true)
    await page.keyboard.press('Enter')
    await page.keyboard.press('ControlOrMeta+Alt+2')
    await typeLine(page, false)
    await page.keyboard.press('Enter')
    await page.keyboard.press('ControlOrMeta+Alt+2')
    await typeLine(page, true)

    await expect(text.locator('code')).toHaveCount(2)
    const [paragraph, paragraphWithCode] = await heights(text.locator('p'))
    const [title, titleWithCode] = await heights(text.locator('h2'))
    expect(paragraphWithCode).toBe(paragraph)
    expect(titleWithCode).toBe(title)
  })
})

// The band and the bar above the sheet stay at the top of the window. The band is one row of the header's height (the crumbs, the
// people, the state, the history and Share) and the bar one of the toolbar's (the toolbar and the comments). Under the width of a
// desktop each part has a row of its own, so nothing is cut. Nothing about the text moves when someone comes or goes.
const commentsToggle = (page: Page) => page.getByRole('button', { name: /^(Comments|Comentarios)/ })
const marginOf = (page: Page) =>
  page.getByRole('complementary', { name: /Comments in the margin|Comentarios al margen/ })
const bandOf = (page: Page) => page.getByRole('button', { name: /^(Share|Compartir)$/ }).locator('xpath=../..')
const barOf = (page: Page) => page.getByRole('toolbar').locator('xpath=../..')
const sheetOf = (page: Page) =>
  page
    .getByRole('textbox', { name: /Document title|Título del documento/ })
    .locator('xpath=ancestor::*[contains(@class,"_sheet_")][1]')
const tokenOf = (page: Page, name: string) =>
  page.evaluate(
    (property) => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(property)),
    name,
  )

/** Shows or hides the margin as the test needs it: the person's own choice, which the page remembers. */
async function setMargin(page: Page, state: 'shown' | 'hidden') {
  const toggle = commentsToggle(page)
  if ((await toggle.getAttribute('aria-expanded')) !== String(state === 'shown')) await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', String(state === 'shown'))
}

test.describe('the band and the bar above the sheet', () => {
  for (const locale of ['en-US', 'es-ES'] as const) {
    // 640 px is a window of 1280 px at a zoom of 200 %: the rows are one for each part there, and the margin is under the sheet.
    for (const width of [640, 1280, 1440]) {
      for (const margin of ['shown', 'hidden'] as const) {
        test.describe(`in ${locale} at ${width} px with the comments ${margin}`, () => {
          test.use({ locale, viewport: { width, height: 900 } })

          test('holds its rows, keeps every part inside and does not move the text when people come', async ({
            page,
          }) => {
            await page.goto(documentPath)
            await textArea(page).waitFor()
            await setMargin(page, margin)
            const toolbarRow = await tokenOf(page, '--layout-toolbar-height')
            const headerRow = await tokenOf(page, '--layout-header-height')
            const desktop = width >= 1280
            const topOfText = async () => (await textArea(page).boundingBox())?.y ?? Number.NaN
            const toolbar = page.getByRole('toolbar')

            async function expectBandAndBarToHold() {
              const band = await bandOf(page).boundingBox()
              const bar = await barOf(page).boundingBox()
              const tools = await toolbar.boundingBox()
              const crumbs = await page
                .getByRole('navigation', { name: /Where the document is|Dónde está el documento/ })
                .boundingBox()
              const history = await page
                .getByRole('button', { name: /^(Version history|Historial de versiones)$/ })
                .boundingBox()
              const share = await page
                .getByRole('button', { name: /^(Share|Compartir)$/ })
                .locator('xpath=..')
                .boundingBox()
              const filter = await page.getByRole('group', { name: /Show comments|Mostrar comentarios/ }).boundingBox()
              const tabs = await page.getByRole('tablist').boundingBox()
              const toggle = await commentsToggle(page).boundingBox()
              // Nobody else is in the document at first, and the list is not drawn for no one.
              const peopleList = page.getByRole('list', { name: /People in this document|Personas en este documento/ })
              const people = (await peopleList.count()) === 0 ? null : await peopleList.boundingBox()
              // One row of the header's height and one of the toolbar's; under a desktop's width, two rows and three.
              expect(band?.height).toBe(desktop ? headerRow : 2 * toolbarRow)
              expect(bar?.height).toBe(desktop ? toolbarRow : 3 * toolbarRow)
              expect(tools?.height).toBeLessThanOrEqual(toolbarRow)
              expect(tools?.width).toBeGreaterThanOrEqual(7 * 36)
              // Every part is inside its row on both sides: a group wider than its room overflows towards its start.
              for (const [frame, parts] of [
                [band, [crumbs, history, share, people]],
                [bar, [tools, filter, tabs, toggle]],
              ] as const) {
                for (const part of parts) {
                  if (part === null) continue
                  expect(part?.x).toBeGreaterThanOrEqual(frame?.x ?? 0)
                  expect((part?.x ?? 0) + (part?.width ?? 0)).toBeLessThanOrEqual((frame?.x ?? 0) + (frame?.width ?? 0))
                }
              }
              // The people end before the state starts: the two share a row and must not run into each other.
              if (people !== null) expect((people?.x ?? 0) + (people?.width ?? 0)).toBeLessThanOrEqual(share?.x ?? 0)
              // On a desktop the parts of the bar share its row; under it, the filter and the tabs are rows of their own.
              if (desktop) {
                expect(Math.abs((filter?.y ?? 0) - (tools?.y ?? 0))).toBeLessThan(toolbarRow)
                // And they do not run into each other: the toolbar keeps every button, whatever the language.
                expect((tools?.x ?? 0) + (tools?.width ?? 0)).toBeLessThanOrEqual(filter?.x ?? 0)
                const link = await toolbar.getByRole('button', { name: /^(Link|Enlace)$/ }).boundingBox()
                expect((link?.x ?? 0) + (link?.width ?? 0)).toBeLessThanOrEqual((tools?.x ?? 0) + (tools?.width ?? 0))
              } else expect(filter?.y).toBeGreaterThanOrEqual((tools?.y ?? 0) + toolbarRow)
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
            }

            const before = await topOfText()
            await expectBandAndBarToHold()

            await page.evaluate(
              async ([documentId, names]) => {
                const mock = Reflect.get(window, 'draftroomMock') as {
                  addPeople(id: string, names: string[]): Promise<unknown>
                }
                await mock.addPeople(documentId as string, names as string[])
              },
              [launchPlan.id, ['Ines Varga', 'Omar Haddad', 'Lucía Ferrer', 'Tobias Lind', 'Noor Aziz']],
            )
            const listed = page
              .getByRole('list', { name: /People in this document|Personas en este documento/ })
              .getByRole('listitem')
            // As many avatars as the row has room for, which depends on the font, and the count says how many are left: all five
            // are there, as an avatar or in the count.
            await expect(listed.first()).toBeVisible()
            await expect
              .poll(async () => {
                const texts = await listed.allInnerTexts()
                const counted = Number(/\d+/.exec(texts.at(-1) ?? '')?.[0] ?? 0)
                return (counted === 0 ? texts.length : texts.length - 1) + counted
              })
              .toBe(5)

            expect(await topOfText()).toBe(before)
            await expectBandAndBarToHold()
          })
        })
      }
    }
  }
})

// What the band measures depends on the font the machine draws the text in, and the font of a runner of the CI is wider than the
// one of a laptop. The band is built so that its parts never overlap whatever the font is: the people give way to the state, and
// the avatars that do not fit are counted instead. Two amounts of letter-spacing stand for fonts wider than any a machine is
// likely to fall back to: 0.04 em is some 28 px more in the Spanish row, and 0.1 em some 70.
test.describe('the band with a wider font', () => {
  for (const spacing of ['0.04em', '0.1em']) {
    for (const locale of ['en-US', 'es-ES'] as const) {
      for (const width of [640, 1280, 1440]) {
        test.describe(`in ${locale} at ${width} px, letters spaced by ${spacing}`, () => {
          test.use({ locale, viewport: { width, height: 900 } })

          test('keeps the people apart from the state and inside the band', async ({ page }) => {
            await page.goto(documentPath)
            await textArea(page).waitFor()
            await page.addStyleTag({ content: `body, button, input { letter-spacing: ${spacing} !important }` })
            await page.evaluate(
              async ([documentId, names]) => {
                const mock = Reflect.get(window, 'draftroomMock') as {
                  addPeople(id: string, names: string[]): Promise<unknown>
                }
                await mock.addPeople(documentId as string, names as string[])
              },
              [launchPlan.id, ['Ines Varga', 'Omar Haddad', 'Lucía Ferrer', 'Tobias Lind', 'Noor Aziz']],
            )

            const list = page.getByRole('list', { name: /People in this document|Personas en este documento/ })
            await list.waitFor()
            const people = await list.boundingBox()
            const state = await page
              .getByRole('button', { name: /^(Share|Compartir)$/ })
              .locator('xpath=..')
              .boundingBox()
            const band = await bandOf(page).boundingBox()
            expect((people?.x ?? 0) + (people?.width ?? 0)).toBeLessThanOrEqual(state?.x ?? 0)
            expect((state?.x ?? 0) + (state?.width ?? 0)).toBeLessThanOrEqual((band?.x ?? 0) + (band?.width ?? 0))
          })
        })
      }
    }
  }
})

// The title is the heading of the document, so it is never cut: a title that does not fit in the width of the sheet wraps.
for (const locale of ['en-US', 'es-ES'] as const) {
  test.describe(`a long title in ${locale}`, () => {
    test.use({ locale, viewport: { width: 1280, height: 800 } })

    test('wraps in the sheet that the margin leaves at 1280 px and cuts nothing', async ({ page }) => {
      await page.goto(documentPath)
      await textArea(page).waitFor()
      const title = page.getByRole('textbox', { name: /Document title|Título del documento/ })
      const oneLine = (await title.boundingBox())?.height ?? Number.NaN
      await title.fill(
        'Plan de lanzamiento de otoño para toda la campaña de octubre, con sus fechas y sus responsables',
      )
      await title.blur()

      // Wider than the field in one line, so it takes more lines, and what it holds fits in it.
      const box = await title.evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }))
      expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth)
      expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight)
      expect((await title.boundingBox())?.height).toBeGreaterThan(oneLine)
      // The text does not start under the title, and the cards of the margin follow it down.
      const text = await textArea(page).boundingBox()
      const titleBox = await title.boundingBox()
      expect(text?.y).toBeGreaterThanOrEqual((titleBox?.y ?? 0) + (titleBox?.height ?? 0))
    })
  })
}

test.describe('the layout', () => {
  for (const width of [1440, 1280]) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 900 } })

      test('starts with the margin beside the sheet, which has the room that is left up to its 708 px', async ({
        page,
      }) => {
        await open(page)

        const sheet = await sheetOf(page).boundingBox()
        const margin = await marginOf(page).boundingBox()
        await expect(commentsToggle(page)).toHaveAttribute('aria-expanded', 'true')
        // 708 px at 1440; at 1280 the margin keeps its 304 px and the text gives way to 568.
        expect(margin?.width).toBeCloseTo(304, 0)
        expect(sheet?.width).toBeCloseTo(width >= 1440 ? 708 : 568, 0)
        expect((sheet?.x ?? 0) + (sheet?.width ?? 0)).toBeLessThanOrEqual(margin?.x ?? 0)
        expect((margin?.x ?? 0) + (margin?.width ?? 0)).toBeLessThanOrEqual(width)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      })

      test('gives the sheet its 708 px when the margin is hidden, and the margin comes back as it was left', async ({
        page,
      }) => {
        await open(page)
        await setMargin(page, 'hidden')

        const sheet = await sheetOf(page).boundingBox()
        expect(sheet?.width).toBe(708)
        await expect(marginOf(page)).toBeHidden()

        await page.reload()
        await textArea(page).waitFor()
        await expect(commentsToggle(page)).toHaveAttribute('aria-expanded', 'false')
      })

      // The layout-shift score cannot see this: it counts what moves after the page has painted, and the skeleton is painted
      // before the screen's chunk has arrived. What it shows has to be where the document will put the band, the bar and the sheet.
      test('shows the skeleton with the band, the bar and the sheet where the document will have them, so nothing jumps', async ({
        page,
      }) => {
        let release: () => void = () => {}
        const held = new Promise<void>((resolve) => {
          release = resolve
        })
        await page.route(/\/assets\/EditorScreen-[^/]*\.js$/, async (route) => {
          await held
          await route.continue()
        })
        await page.goto(documentPath, { waitUntil: 'commit' })
        const skeleton = page.locator('[aria-busy="true"]')
        const skeletonChrome = skeleton.locator(':scope > div').first()
        const skeletonSheet = skeleton.locator(':scope > div').nth(1).locator(':scope > div').first()
        await skeletonChrome.waitFor()
        const waitingChrome = await skeletonChrome.boundingBox()
        const waitingSheet = await skeletonSheet.boundingBox()

        release()
        await textArea(page).waitFor()
        const loadedChrome = await barOf(page).locator('xpath=..').boundingBox()
        const loadedSheet = await sheetOf(page).boundingBox()

        // The sheet starts where the bar ends, and it is where the skeleton had it, with its width.
        expect(waitingChrome?.height).toBe(loadedChrome?.height)
        expect(waitingChrome?.y).toBe(loadedChrome?.y)
        expect(waitingSheet?.x).toBeCloseTo(loadedSheet?.x ?? 0, 0)
        expect(waitingSheet?.y).toBeCloseTo(loadedSheet?.y ?? 0, 0)
        expect(waitingSheet?.width).toBeCloseTo(loadedSheet?.width ?? 0, 0)
      })

      test('does not shift while the document arrives', async ({ page }) => {
        await page.goto(documentPath)
        await textArea(page).waitFor()

        expect(await shifts(page)).toBeLessThan(0.01)
      })

      test('does not shift while the document arrives with the margin hidden', async ({ page }) => {
        await page.goto(documentPath)
        await textArea(page).waitFor()
        await setMargin(page, 'hidden')
        await page.reload()
        await textArea(page).waitFor()

        expect(await shifts(page)).toBeLessThan(0.01)
      })
    })
  }
})

// One scroll: the page. A document as long as a real one, with many comments, at the two desktop sizes of the plan.
test.describe('one scroll', () => {
  const paragraphs = 30

  /** Starts a comment on the first words of paragraph `number` (or on `quote`), as the key does, and sends it. */
  async function commentOn(page: Page, quote: string, body: string) {
    await page.evaluate((words) => {
      const text = document.querySelector('[role="textbox"][aria-label="Document content"]') as
        | (HTMLElement & {
            editor: {
              state: {
                doc: { descendants(visit: (node: { isText: boolean; text?: string }, at: number) => void): void }
              }
              commands: { setTextSelection(range: { from: number; to: number }): void; focus(): void }
            }
          })
        | null
      if (text === null) throw new Error('The text is not on the page')
      let range: { from: number; to: number } | null = null
      text.editor.state.doc.descendants((node, at) => {
        const index = node.isText ? (node.text ?? '').indexOf(words) : -1
        if (range === null && index >= 0) range = { from: at + index, to: at + index + words.length }
      })
      if (range === null) throw new Error(`"${words}" is not in the text`)
      text.editor.commands.focus()
      text.editor.commands.setTextSelection(range)
    }, quote)
    // The editor learns of the selection from an event that the browser sends after; the next key reads what it knows.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.keyboard.press('ControlOrMeta+Alt+m')
    await page.keyboard.type(body)
    await page.keyboard.press('Control+Enter')
    await expect(marginOf(page).locator('[data-thread-id]').filter({ hasText: body }).first()).toBeAttached()
  }

  for (const [width, height] of [
    [1280, 800],
    [1440, 900],
  ] as const) {
    test(`at ${width} × ${height}: only the page scrolls, the band and the bar stay, and each comment is level with its text`, async ({
      page,
    }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height })
      await page.goto(documentPath)
      const text = await open(page)
      await page.keyboard.press('Control+End')
      for (let paragraph = 1; paragraph <= paragraphs; paragraph++) {
        await page.keyboard.press('Enter')
        await page.keyboard.insertText(`Paragraph ${paragraph} of a text that is long enough to be a real one.`)
      }
      // Eleven threads, each on a paragraph of its own, and a second one on the same paragraph as one of them.
      for (const paragraph of [2, 3, 4, 8, 9, 10, 15, 16, 22, 23, 24]) {
        await commentOn(page, `Paragraph ${paragraph} `, `Thread on ${paragraph}`)
      }
      await commentOn(page, 'long enough', 'A second thread on the last paragraph')
      // The twelve, and the one the launch plan has already, whose text is gone and which is at the end.
      const cards = marginOf(page).locator('[data-thread-id]')
      await expect(cards).toHaveCount(13)
      await text.evaluate((element) => element.blur())

      // The page is what scrolls: nothing else has a scroll of its own, and the explorer fits.
      const scrollZones = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((element) => {
            const { overflowY } = getComputedStyle(element)
            return (overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight + 1
          })
          .map((element) => element.tagName + '.' + element.className),
      )
      expect(scrollZones, 'zones that scroll on their own').toEqual([])
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
      expect(pageHeight, 'the page is longer than the window').toBeGreaterThan(height)

      // Where each card is, and where its text: the card is level with it, and never above it.
      const placed = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('aside [data-thread-id]')].map((card) => {
          const id = card.dataset['threadId'] ?? ''
          const mark = document.querySelector(`mark[data-comment-thread="${id}"]`)
          const box = card.getBoundingClientRect()
          return {
            id,
            top: box.top + window.scrollY,
            bottom: box.bottom + window.scrollY,
            text: (mark?.getBoundingClientRect().top ?? NaN) + window.scrollY,
          }
        }),
      )
      expect(placed).toHaveLength(13)
      const onText = placed.filter((card) => !Number.isNaN(card.text))
      expect(onText).toHaveLength(12)
      const tolerance = 6
      for (const card of onText)
        expect(card.top, `card ${card.id} is not above its text`).toBeGreaterThanOrEqual(card.text - tolerance)
      // Nothing overlaps: each card ends before the next one starts, in the order of the text.
      for (const [index, card] of placed.slice(0, -1).entries()) {
        expect(card.bottom, `card ${index} ends before the next`).toBeLessThanOrEqual(
          (placed[index + 1]?.top ?? Infinity) + 0.5,
        )
      }
      // None is lower than the tolerance (two lines, 48 px) before the text opens room for it, and the threads that have a card
      // of their own are level with their text.
      for (const card of onText)
        expect(card.top - card.text, `card ${card.id} is not far below its text`).toBeLessThanOrEqual(48 + tolerance)
      expect(onText.filter((card) => Math.abs(card.top - card.text) <= tolerance).length).toBeGreaterThanOrEqual(4)
      // Cards that would have overlapped the text under them have had room opened for them.
      expect(await page.locator('[data-comment-gap]').count()).toBeGreaterThan(0)

      // The band and the bar stay at the top of the window as the page goes by under them.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const band = await bandOf(page).boundingBox()
      const bar = await barOf(page).boundingBox()
      expect(band?.y).toBe(0)
      expect(bar?.y).toBeCloseTo((band?.y ?? 0) + (band?.height ?? 0), 0)
      await expect(commentsToggle(page)).toBeInViewport()
      await expect(page.getByRole('button', { name: 'Share' })).toBeInViewport()
    })
  }

  // The room the text opens for the thread the person is on is what makes the text jump when they choose one, so it is kept
  // small: the active card is short (the actions over the header, a reply of one line) and uses the room above it first.
  test('opens little room in the text for the active thread', async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(documentPath)
    await open(page)
    await page.keyboard.press('Control+End')
    for (const line of [
      'The first paragraph is short.',
      'The second paragraph is short too.',
      'The third paragraph is the next one.',
    ]) {
      await page.keyboard.press('Enter')
      await page.keyboard.insertText(line)
    }
    await commentOn(page, 'first paragraph', 'About the first')
    await commentOn(page, 'second paragraph', 'About the second')
    await commentOn(page, 'third paragraph', 'About the third')
    const room = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-comment-gap]')].reduce(
          (sum, block) => sum + Number(block.dataset['commentGap']),
          0,
        ),
      )
    await marginOf(page).locator('[data-thread-id]').filter({ hasText: 'About the second' }).click()
    const active = marginOf(page).getByRole('article')
    await expect(active).toBeVisible()

    // The whole card, with its conversation, a reply of one line and Resolve: no taller than a card of the preview with two comments.
    expect((await active.boundingBox())?.height).toBeLessThanOrEqual(240)
    // 137 px of room in all with the three rules; 185 without the tolerance and 200 without the room above.
    await expect.poll(room).toBeLessThanOrEqual(160)
  })

  // What changes the height of something above the text (the error of the title) moves the text and nothing the margin watches
  // changes size: the cards have to follow it all the same.
  test('keeps each card level with its text when something above the text changes height', async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(documentPath)
    await open(page)
    await page.keyboard.press('Control+End')
    for (const line of ['The first paragraph, which is commented on.', 'The second paragraph, which is too.']) {
      await page.keyboard.press('Enter')
      await page.keyboard.insertText(line)
    }
    await commentOn(page, 'first paragraph', 'About the first')
    await commentOn(page, 'second paragraph', 'About the second')
    // How far each card is from its text (signed), by thread.
    const offsets = () =>
      page.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll<HTMLElement>('aside [data-thread-id]')].flatMap((card) => {
            const id = card.dataset['threadId'] ?? ''
            const mark = document.querySelector(`mark[data-comment-thread="${id}"]`)
            return mark === null ? [] : [[id, card.getBoundingClientRect().top - mark.getBoundingClientRect().top]]
          }),
        ),
      )
    const settled = await offsets()
    expect(Object.keys(settled)).toHaveLength(2)

    // An empty title is refused when the person leaves it, and says so under it: the text goes down by that much.
    const title = page.getByRole('textbox', { name: 'Document title' })
    const topOfText = async () => (await textArea(page).boundingBox())?.y ?? Number.NaN
    const before = await topOfText()
    await title.fill('')
    await title.blur()
    await expect(page.getByText('Give the document a title.')).toBeVisible()
    expect(await topOfText()).toBeGreaterThan(before)

    // The text went down and the cards went with it: each is as far from its text as it was.
    await expect
      .poll(
        async () => {
          const now = await offsets()
          return Math.max(...Object.entries(settled).map(([id, offset]) => Math.abs((now[id] ?? Number.NaN) - offset)))
        },
        { message: 'cards as far from their text as before' },
      )
      .toBeLessThanOrEqual(6)
  })

  // A browser zoomed to 200 % on a window of 1280 px is a window of 640 × 360 CSS px: there is no beside for the margin, which
  // goes under the sheet with its cards in the order of the text, and the band and the bar go by with the page.
  test('zoomed to 200 %: the margin is under the sheet, in the order of the text, and nothing is cut', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 640, height: 360 })
    await page.goto(documentPath)
    await open(page)
    await page.keyboard.press('Control+End')
    for (const line of ['The first paragraph, which is commented on.', 'The second paragraph, which is too.']) {
      await page.keyboard.press('Enter')
      await page.keyboard.insertText(line)
    }
    await commentOn(page, 'second paragraph', 'About the second')
    await commentOn(page, 'first paragraph', 'About the first')

    const sheet = await sheetOf(page).boundingBox()
    const margin = await marginOf(page).boundingBox()
    // Under the sheet, as wide as the page lets it be, and the page does not scroll sideways.
    expect(margin?.y).toBeGreaterThanOrEqual((sheet?.y ?? 0) + (sheet?.height ?? 0))
    expect((margin?.x ?? 0) + (margin?.width ?? 0)).toBeLessThanOrEqual(640)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    // In the order of the text, not of the time they were made in.
    const cards = marginOf(page).locator('[data-thread-id]')
    await expect(cards.filter({ hasText: 'About the first' })).toBeAttached()
    const order = await cards.evaluateAll((elements) => elements.map((element) => element.textContent ?? ''))
    expect(order.findIndex((card) => card.includes('About the first'))).toBeLessThan(
      order.findIndex((card) => card.includes('About the second')),
    )
    // Each card is under the one before it, in the flow: none is laid over another.
    const boxes = await cards.evaluateAll((elements) =>
      elements.map((element) => {
        const { top, bottom } = element.getBoundingClientRect()
        return { top, bottom }
      }),
    )
    for (const [index, box] of boxes.slice(1).entries()) {
      expect(box.top, `card ${index + 1} starts after the one before it`).toBeGreaterThanOrEqual(
        boxes[index]?.bottom ?? 0,
      )
    }
    // Nothing is cut: each card holds what it says, and none is outside the window.
    const cut = await cards.evaluateAll((elements) =>
      elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.className),
    )
    expect(cut).toEqual([])
    // No room was opened in the text, which is measured only beside it.
    expect(await page.locator('[data-comment-gap]').count()).toBe(0)
    // The band and the bar are five rows of the toolbar's height: they go by with the page, so the text has the window.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    expect((await bandOf(page).boundingBox())?.y ?? 0).toBeLessThan(0)
  })
})

// The skeleton is on the screen for a moment only: its measures are taken as it appears, before the real ones replace it (the
// pattern of the other screens of the suite). The band, the bar and the sheet must be where the document will have them.
for (const width of [1280, 640] as const) {
  test(`gives the document the band, the bar and the sheet of its skeleton at ${width} px, so nothing moves`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 640 ? 360 : 800 })
    await page.addInitScript(() => {
      type Box = { x: number; y: number; width: number; height: number }
      const seen = window as unknown as { skeleton?: { band: Box; bar: Box; sheet: Box } }
      const box = (element: Element): Box => {
        const { x, y, width: w, height: h } = element.getBoundingClientRect()
        return { x, y, width: w, height: h }
      }
      new MutationObserver(() => {
        const skeleton = document.querySelector('main [aria-busy="true"]')
        const chrome = skeleton?.firstElementChild
        const sheet = skeleton?.children[1]?.firstElementChild
        const [band, bar] = [chrome?.children[0], chrome?.children[1]]
        if (seen.skeleton === undefined && band && bar && sheet) {
          seen.skeleton = { band: box(band), bar: box(bar), sheet: box(sheet) }
        }
      }).observe(document, { childList: true, subtree: true })
    })
    await page.goto(documentPath)
    await textArea(page).waitFor()
    await expect(marginOf(page)).toBeAttached()

    const seen = await page.evaluate(
      () => (window as unknown as { skeleton?: Record<'band' | 'bar' | 'sheet', Record<string, number>> }).skeleton,
    )
    expect(seen, 'the skeleton was seen').toBeDefined()
    const real = {
      band: await bandOf(page).boundingBox(),
      bar: await barOf(page).boundingBox(),
      sheet: await sheetOf(page).boundingBox(),
    }
    for (const part of ['band', 'bar', 'sheet'] as const) {
      expect(real[part]?.x, `${part} x`).toBeCloseTo(seen?.[part]?.['x'] ?? NaN, 0)
      expect(real[part]?.y, `${part} y`).toBeCloseTo(seen?.[part]?.['y'] ?? NaN, 0)
      expect(real[part]?.width, `${part} width`).toBeCloseTo(seen?.[part]?.['width'] ?? NaN, 0)
    }
    expect(real.band?.height).toBeCloseTo(seen?.band?.['height'] ?? NaN, 0)
    expect(real.bar?.height).toBeCloseTo(seen?.bar?.['height'] ?? NaN, 0)
  })
}
