// Puts the first-paint scripts in <head> of the HTML, where they run before the stylesheet paints: a reload then
// flashes neither the theme the operating system prefers nor a page in the wrong language.
import type { Plugin } from 'vite'

/**
 * The HTML with `scripts` (the source of each) in order, right after the viewport meta. That is after the encoding
 * declaration, which the browser only looks for in the first 1024 bytes, and before the title, the stylesheet and the
 * app. They are not at the very start of <head>: a script that grows would push `<meta charset>` out of those bytes.
 */
export function insertFirstPaintScripts(html: string, scripts: readonly string[]): string {
  const viewport = /<meta\s+name="viewport"[^>]*>/g
  if (html.match(viewport)?.length !== 1) throw new Error('Expected exactly one viewport meta in the HTML template')
  const tags = scripts.map((script) => `<script>${script}</script>`).join('')
  return html.replace(viewport, (meta) => `${meta}\n    ${tags}`)
}

/** Vite plugin: puts `scripts` in the first-paint place of index.html, in the dev server and in the build. */
export function firstPaintScripts(scripts: readonly string[]): Plugin {
  return {
    name: 'draftroom-first-paint-scripts',
    transformIndexHtml: (html) => insertFirstPaintScripts(html, scripts),
  }
}
