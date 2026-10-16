#!/usr/bin/env node
// Waits until every target answers, then exits 0; exits 1 naming what did not, when the time runs out.
//
//   node scripts/wait-for.mjs tcp://127.0.0.1:5464 http://127.0.0.1:8384/api/health/ready --timeout 60
//
// A `tcp://host:port` target is ready when the port accepts a connection. An `http(s)://` target is ready when it answers
// with a 2xx status, which is what lets a readiness probe say that the database is reachable and migrated, not only that
// the process listens. Used by the real-stack end-to-end suite, locally and in CI, so both start the stack the same way.

import { connect } from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'

const pollMilliseconds = 250
const attemptMilliseconds = 2_000

function acceptsConnection(host, port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    const settle = (accepted) => {
      socket.destroy()
      resolve(accepted)
    }
    socket.setTimeout(attemptMilliseconds, () => settle(false))
    socket.once('connect', () => settle(true))
    socket.once('error', () => settle(false))
  })
}

async function answersWell(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(attemptMilliseconds) })
    return response.ok
  } catch {
    return false
  }
}

function readinessOf(target) {
  const url = new URL(target)
  if (url.protocol === 'tcp:') return () => acceptsConnection(url.hostname, Number(url.port))
  if (url.protocol === 'http:' || url.protocol === 'https:') return () => answersWell(target)
  throw new Error(`Cannot wait for ${target}: use tcp://host:port or an http(s) address`)
}

async function waitUntilReady(target, deadline) {
  const isReady = readinessOf(target)
  while (!(await isReady())) {
    if (Date.now() >= deadline) return false
    await sleep(pollMilliseconds)
  }
  return true
}

function parseArguments(argv) {
  const targets = []
  let timeoutSeconds = 60
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--timeout') {
      timeoutSeconds = Number(argv[(index += 1)])
    } else {
      targets.push(argument)
    }
  }
  if (targets.length === 0 || !Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new Error('Usage: wait-for.mjs <tcp://host:port | http(s)://address>... [--timeout seconds]')
  }
  return { targets, timeoutSeconds }
}

try {
  const { targets, timeoutSeconds } = parseArguments(process.argv.slice(2))
  const deadline = Date.now() + timeoutSeconds * 1_000
  const results = await Promise.all(targets.map((target) => waitUntilReady(target, deadline)))
  const missing = targets.filter((_, index) => !results[index])
  if (missing.length > 0) {
    console.error(`Not ready after ${timeoutSeconds} s: ${missing.join(', ')}`)
    process.exit(1)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
