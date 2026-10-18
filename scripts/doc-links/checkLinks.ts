import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// The README and the architecture document are read by people who follow their links, and a file that moved leaves a link
// that opens a 404 on GitHub. This finds those: a relative link whose target is not in the repository. Links to other sites,
// mail addresses and anchors inside the same page are not its business.

export interface BrokenLink {
  readonly file: string
  readonly line: number
  readonly target: string
}

// `[text](target)` and `![alt](target)`; a target may be wrapped in <>, and may be followed by a title.
const inlineLink = /!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]*)[^)]*\)/g
// `[label]: target`
const referenceDefinition = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/

const outside = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i

/** The file a link points to, or `null` when the link is not one to a file of the repository. */
export function fileOf(target: string): string | null {
  const bare = target.replace(/^<|>$/g, '').trim()
  if (bare === '' || outside.test(bare)) return null
  const path = bare.split(/[#?]/, 1)[0] ?? ''
  return path === '' ? null : decodeURIComponent(path)
}

function* targetsIn(markdown: string): Generator<{ line: number; target: string }> {
  let fenced = false
  for (const [index, text] of markdown.split('\n').entries()) {
    if (/^\s{0,3}(```|~~~)/.test(text)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    // Code spans hold examples, not links.
    const prose = text.replace(/`[^`]*`/g, '')
    for (const match of prose.matchAll(inlineLink)) yield { line: index + 1, target: match[1] ?? '' }
    const definition = referenceDefinition.exec(prose)
    if (definition !== null) yield { line: index + 1, target: definition[1] ?? '' }
  }
}

/** Every relative link of the given Markdown files (paths from `root`) whose target does not exist. */
export function findBrokenLinks(root: string, files: readonly string[]): BrokenLink[] {
  const broken: BrokenLink[] = []
  for (const file of files) {
    const markdown = readFileSync(resolve(root, file), 'utf8')
    for (const { line, target } of targetsIn(markdown)) {
      const path = fileOf(target)
      if (path === null) continue
      // A path that starts with `/` is from the root of the repository, as GitHub reads it.
      const absolute = path.startsWith('/') ? resolve(root, `.${path}`) : resolve(root, dirname(file), path)
      if (!existsSync(absolute)) broken.push({ file, line, target })
    }
  }
  return broken
}
