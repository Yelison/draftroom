import { isAllowedLinkHref, isAllowedSliceContext } from '@draftroom/editor-schema'

/** Elements that are removed with everything inside them: they run code, load something or are not text at all. */
const removedElements = [
  'script',
  'style',
  'link',
  'meta',
  'base',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'template',
  'noscript',
  'svg',
  'math',
  'img',
  'picture',
  'video',
  'audio',
  'source',
  'canvas',
].join(',')

/**
 * What survives of each attribute. Everything else goes: event handlers, `class`, `id`, `src`, `srcset`, `data-*`.
 *
 * - `href` of a link, when its address is allowed.
 * - `start` of a numbered list, when it is a whole number a person could type.
 * - `data-pm-slice`, the editor's own mark on what it copied, which it reads back to paste a list item into a list
 *   instead of beside it. It names the nodes that wrapped the copied content and ProseMirror builds them as given, so it
 *   is kept only when it names nodes and attributes the schema holds.
 * - `style`, reduced to `font-weight` and `font-style` with values from a short list. Tiptap's own rules read them to tell
 *   bold and italic apart: Google Docs wraps everything it copies in `<b style="font-weight: normal">`, which is not bold,
 *   and says bold with `<span style="font-weight: 700">`; Word says it with `font-weight` and `font-style` too. Dropping
 *   every `style` would make the wrapper bold and lose the rest. Nothing else of a style reaches the editor, and what is
 *   kept is rebuilt from the list, never copied.
 */
const keptValue: Record<string, (element: Element, value: string) => string | null> = {
  href: (element, value) => (element.localName === 'a' && isAllowedLinkHref(value) ? value : null),
  start: (element, value) => (element.localName === 'ol' && /^\d{1,6}$/.test(value) ? value : null),
  'data-pm-slice': (_element, value) => (isAllowedSliceContext(value) ? value : null),
  style: (_element, value) => fontStyleOf(value),
}

const fontWeight = /^(normal|bold|bolder|lighter|[1-9]00)$/
const fontStyle = /^(normal|italic|oblique)$/

/** The `font-weight` and `font-style` of a style attribute, with values from the lists above, or `null` when there are none. */
function fontStyleOf(style: string): string | null {
  const kept: string[] = []
  for (const declaration of style.split(';')) {
    const [property = '', ...rest] = declaration.split(':')
    const name = property.trim().toLowerCase()
    const value = rest.join(':').trim().toLowerCase()
    if ((name === 'font-weight' && fontWeight.test(value)) || (name === 'font-style' && fontStyle.test(value))) {
      kept.push(`${name}: ${value}`)
    }
  }
  return kept.length > 0 ? kept.join('; ') : null
}

/**
 * Cleans HTML before the editor reads it. The schema already decides which nodes and marks a paste can become (and
 * the content guard of the schema puts right any attribute that still gets past), so this is the layer before it: no
 * script, handler, unsafe address or odd clipboard context is left for anything downstream to trust.
 *
 * `DOMParser` builds a document that has no page: scripts in it do not run and images in it do not load, which is why
 * it is used and the HTML is never set on an element of the page.
 */
export function sanitizePastedHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  for (const element of parsed.body.querySelectorAll(removedElements)) element.remove()

  for (const element of parsed.body.querySelectorAll('*')) {
    for (const { name, value } of [...element.attributes]) {
      const kept = keptValue[name]?.(element, value) ?? null
      if (kept === null) element.removeAttribute(name)
      else if (kept !== value) element.setAttribute(name, kept)
    }
  }
  return parsed.body.innerHTML
}
