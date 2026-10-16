import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'

/**
 * Serves the static demo the way GitHub Pages does, and nothing more: only under the repository's path, a file that
 * exists as itself, and `404.html` with a 404 status for anything else. `vite preview` would answer every route with
 * `index.html` and a 200, so a demo whose `404.html` was missing would pass its tests here and break on Pages.
 */
const basePath = '/draftroom/'
const root = resolve(import.meta.dirname, '..', 'dist-demo')
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173)

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

async function read(path: string) {
  try {
    return await readFile(path)
  } catch {
    return undefined
  }
}

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost')
  if (!pathname.startsWith(basePath)) {
    response.writeHead(404).end()
    return
  }

  const relative = decodeURIComponent(pathname.slice(basePath.length))
  const path = resolve(root, relative === '' ? 'index.html' : relative)
  const file = path.startsWith(root + sep) ? await read(path) : undefined
  if (file !== undefined) {
    response.writeHead(200, { 'content-type': contentTypes[extname(path)] ?? 'application/octet-stream' }).end(file)
    return
  }

  const notFound = await read(join(root, '404.html'))
  response.writeHead(404, { 'content-type': contentTypes['.html'] ?? 'text/html' }).end(notFound ?? 'Not found')
})

server.listen(port, () => console.log(`The demo is served at http://localhost:${port}${basePath}`))
