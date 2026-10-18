import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { fileOf, findBrokenLinks, introductoryDocuments } from './checkLinks.ts'

describe('a relative link', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'doc-links-'))
    mkdirSync(join(root, 'docs'))
    writeFileSync(join(root, 'LICENSE'), 'MIT')
    writeFileSync(join(root, 'docs/guide.md'), '# Guide')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const check = (markdown: string, file = 'README.md') => {
    writeFileSync(join(root, file), markdown)
    return findBrokenLinks(root, [file])
  }

  it('to a file that exists is fine, whatever follows the path', () => {
    expect(check('[license](LICENSE) and [guide](docs/guide.md#top) and [again](./docs/guide.md?plain=1)')).toEqual([])
  })

  it('to a file that is not there is reported with its line', () => {
    expect(check('# Title\n\nSee [the guide](docs/missing.md).')).toEqual([
      { file: 'README.md', line: 3, target: 'docs/missing.md' },
    ])
  })

  it('is read from the folder of the file that holds it', () => {
    writeFileSync(join(root, 'docs/architecture.md'), '[home](../README.md) [sibling](guide.md) [lost](../LICENCE)')
    writeFileSync(join(root, 'README.md'), '')
    expect(findBrokenLinks(root, ['docs/architecture.md'])).toEqual([
      { file: 'docs/architecture.md', line: 1, target: '../LICENCE' },
    ])
  })

  it('is checked for an image too, and for a reference definition', () => {
    expect(check('![shot](docs/assets/shot.png)\n\n[ref]: docs/gone.md')).toEqual([
      { file: 'README.md', line: 1, target: 'docs/assets/shot.png' },
      { file: 'README.md', line: 3, target: 'docs/gone.md' },
    ])
  })

  it('to another site, a mail address or the same page is not a file', () => {
    expect(check('[a](https://example.com/x) [b](mailto:a@b.example) [c](#section) [d](//cdn.example/x.js)')).toEqual(
      [],
    )
  })

  it('in an HTML tag is checked as well as one in Markdown', () => {
    expect(
      check(
        '<video src="docs/assets/missing.webm" controls></video>\n<a href="LICENSE">fine</a> <img src=\'gone.png\'>',
      ),
    ).toEqual([
      { file: 'README.md', line: 1, target: 'docs/assets/missing.webm' },
      { file: 'README.md', line: 2, target: 'gone.png' },
    ])
  })

  it('inside a code fence or a code span is an example, not a link', () => {
    expect(check('`[x](nowhere.md)`\n\n```md\n[y](nowhere.md)\n```\n')).toEqual([])
  })

  it('reports each broken link of a line', () => {
    expect(check('[one](a.md) [two](LICENSE) [three](b.md)').map(({ target }) => target)).toEqual(['a.md', 'b.md'])
  })
})

describe('the file of a target', () => {
  it.each([
    ['docs/a.md#part', 'docs/a.md'],
    ['<docs/with space.md>', 'docs/with space.md'],
    ['docs/with%20space.md', 'docs/with space.md'],
    ['#part', null],
    ['https://example.com', null],
  ])('%s is %s', (target, file) => {
    expect(fileOf(target)).toBe(file)
  })
})

describe('the documents that introduce the project', () => {
  // What the CI runs, since it runs `npm test` and not `npm run docs:links`: a link that breaks in a README fails here.
  it('link only to files that exist', () => {
    const root = resolve(import.meta.dirname, '../..')
    const documents = introductoryDocuments(root)
    expect(documents).toEqual(expect.arrayContaining(['README.md', 'README.es.md', 'docs/architecture.md']))
    expect(findBrokenLinks(root, documents)).toEqual([])
  })
})
