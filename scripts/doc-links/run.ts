import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { findBrokenLinks } from './checkLinks.ts'

// `npm run docs:links`: the Markdown that introduces the project must not link to a file that is not there.

const root = resolve(import.meta.dirname, '../..')
const files = [...readdirSync(root).filter((name) => /^README(\.[a-z]{2})?\.md$/.test(name)), 'docs/architecture.md']

const broken = findBrokenLinks(root, files)
for (const { file, line, target } of broken) console.error(`${file}:${line} links to ${target}, which does not exist`)
if (broken.length > 0) process.exit(1)
console.log(`${files.length} files checked, no broken relative links`)
