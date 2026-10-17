import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { repositoryRoot } from './environment.ts'

const run = promisify(execFile)
const script = resolve(repositoryRoot, 'scripts/wait-for.mjs')

/** Resolves when every target answers (`tcp://host:port`, or an http address that answers 2xx); rejects when they do not. */
export async function waitFor(targets: readonly string[], timeoutSeconds = 60): Promise<void> {
  await run(process.execPath, [script, ...targets, '--timeout', String(timeoutSeconds)])
}
