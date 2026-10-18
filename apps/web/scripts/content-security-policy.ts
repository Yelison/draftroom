// The policy of the page, written into the built `index.html` from the scripts that page actually has. It is a <meta> tag
// and not a header so that it travels with the file: whatever serves `dist/` (the proxy of the deployment, `vite preview`,
// the static demo) serves the policy that matches its hashes, and none of them can get a hash wrong by hand.
// What a <meta> cannot say (`frame-ancestors`) and the other security headers are the proxy's (docs/decisions/0017).
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

/** A script with no `src`: the one kind of code the policy lets run by its hash. */
const inlineScript = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g

/** The source text of every inline script of a page, in order. */
export function inlineScripts(html: string): string[] {
  return [...html.matchAll(inlineScript)].map(([, source = '']) => source)
}

/** How a policy names a script: the SHA-256 of its exact text. A character more or less and it does not run. */
export const scriptSource = (source: string): string =>
  `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`

/**
 * What the page may load and do, and nothing else (`default-src 'none'`).
 *
 * - **Scripts** are the app's own files and the inline scripts of the first paint, by hash: no `unsafe-inline`, no `eval`.
 * - **Styles** allow inline `style` attributes, because the editor puts them on the nodes it decorates (ProseMirror
 *   widgets, the colour of a collaborator's caret) and a position is not a thing a stylesheet can name ahead of time.
 *   Style cannot run code, and an attribute cannot load anything the other directives forbid.
 * - **Connections** are the page's own origin (REST and the collaboration socket are served from it, behind the proxy)
 *   and `wss:`, because Safari has not always counted a WebSocket to the same host as `'self'`.
 * - **Images** include `data:` and `blob:` for what the editor builds from a pasted image; **workers** none.
 */
export function contentSecurityPolicy(
  scriptSources: readonly string[],
  {
    asHeader = false,
    connectSources = ["'self'", 'wss:'],
  }: { asHeader?: boolean; connectSources?: readonly string[] } = {},
): string {
  const directives: Record<string, readonly string[]> = {
    'default-src': ["'none'"],
    'script-src': ["'self'", ...scriptSources],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': connectSources,
    'manifest-src': ["'self'"],
    'base-uri': ["'none'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
    // Only a header can say it: a browser ignores it in a <meta> tag.
    ...(asHeader ? { 'frame-ancestors': ["'none'"] } : {}),
  }
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ')
}

/**
 * The page with its policy as the first thing after the encoding declaration: a policy only governs what comes after it,
 * and the encoding has to stay within the first 1024 bytes.
 */
export function insertContentSecurityPolicy(html: string): string {
  const charset = /<meta\s+charset="[^"]*"\s*\/?>/g
  if (html.match(charset)?.length !== 1) throw new Error('Expected exactly one charset meta in the HTML')
  const policy = contentSecurityPolicy(inlineScripts(html).map(scriptSource))
  return html.replace(
    charset,
    (meta) => `${meta}\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
  )
}

/** Vite plugin: the policy goes into the built page, after the other plugins have added the scripts it must name. The dev server has none: its hot reload is an inline script. */
export function contentSecurityPolicyMeta(): Plugin {
  return {
    name: 'draftroom-content-security-policy',
    apply: 'build',
    transformIndexHtml: { order: 'post', handler: insertContentSecurityPolicy },
  }
}
