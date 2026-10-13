import { isAllowedLinkHref } from '@draftroom/editor-schema'

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
 * The attributes that survive, by element. Everything else goes: event handlers, `style`, `class`, `id`, `src`,
 * `srcset`, `data-*`. `data-pm-slice` is the editor's own mark on what it copied, which it reads back to paste a list
 * item into a list instead of beside it.
 */
const keptAttributes: Record<string, readonly string[]> = { a: ['href'], ol: ['start'] }
const keptEverywhere = ['data-pm-slice']

/**
 * Cleans HTML before the editor reads it. The schema already decides which nodes and marks a paste can become, so this
 * is the layer before it: no script, handler, style or unsafe address is left for anything downstream to trust.
 *
 * `DOMParser` builds a document that has no page: scripts in it do not run and images in it do not load, which is why
 * it is used and the HTML is never set on an element of the page.
 */
export function sanitizePastedHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  for (const element of parsed.body.querySelectorAll(removedElements)) element.remove()

  for (const element of parsed.body.querySelectorAll('*')) {
    const kept = keptAttributes[element.localName] ?? []
    for (const { name, value } of [...element.attributes]) {
      const isKept = kept.includes(name) || keptEverywhere.includes(name)
      const isUnsafeAddress = element.localName === 'a' && name === 'href' && !isAllowedLinkHref(value)
      if (!isKept || isUnsafeAddress) element.removeAttribute(name)
    }
  }
  return parsed.body.innerHTML
}
