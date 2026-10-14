/* The editor in the production build, with a real browser: typing, the keyboard, the clipboard, the focus and the layout. */
import type { Locator, Page } from '@playwright/test'
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
    test(`keeps only the text of ${name}, with nothing that runs and no link`, async ({ page }) => {
      const text = await open(page)

      await paste(text, html)

      await expect(text.locator('p')).toHaveText(expected)
      expect(await text.innerHTML()).not.toMatch(
        /<script|<img|<svg|<iframe|onerror|onload|onclick|onmouseover|style=|href="(javascript|data)/i,
      )
      await expect(text.locator('a')).toHaveCount(0)
      expect(await page.evaluate(() => 'pwned' in window)).toBe(false)
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

    await page.keyboard.press('Shift+Tab')
    await expect(toolbarButton(page, 'Bold')).toBeFocused()
    await expect(toolbarButton(page, 'Bold')).toHaveCSS('outline-style', 'solid')
    await page.keyboard.press('ArrowRight')
    await expect(toolbarButton(page, 'Italic')).toBeFocused()
    await page.keyboard.press('End')
    await expect(toolbarButton(page, 'Link')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('textbox', { name: 'Document title' })).toBeFocused()
  })

  test('shows the shortcut in a tooltip on the keyboard focus and hides it with Escape', async ({ page }) => {
    await page.goto(documentPath)
    await textArea(page).waitFor()
    await page.getByRole('textbox', { name: 'Document title' }).focus()

    await page.keyboard.press('Shift+Tab')

    await expect(page.getByRole('tooltip')).toHaveText(/^Bold \((Ctrl|⌘)\+?B\)$/)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  })

  test('is reachable end to end with the keyboard, in reading order', async ({ page }) => {
    await page.goto(documentPath)
    await textArea(page).waitFor()
    // The explorer's rows arrive with its data; the Tab key finds the tree where it will be.
    await page.getByRole('tree').waitFor()

    const stops: (string | null)[] = []
    for (let press = 0; press < 13; press++) {
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
    }

    expect(stops).toEqual([
      'Skip to content',
      'Home',
      'Documents',
      'Shared',
      'History',
      'Settings',
      // The explorer: its search, its two buttons and one stop for the whole tree, which is the open document.
      'Search documents',
      'New document',
      'New folder',
      'Autumn launch plan',
      'Bold',
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

test.describe('the layout', () => {
  for (const width of [1440, 1280]) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 900 } })

      test('keeps the sheet at its width, with no horizontal scroll', async ({ page }) => {
        await open(page)

        const sheet = await page.getByRole('toolbar').locator('xpath=..').boundingBox()
        expect(sheet?.width).toBeLessThanOrEqual(708)
        expect(sheet?.width).toBeGreaterThan(600)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      })

      test('does not shift while the document arrives', async ({ page }) => {
        await page.goto(documentPath)
        await textArea(page).waitFor()

        expect(await shifts(page)).toBeLessThan(0.01)
      })
    })
  }
})
