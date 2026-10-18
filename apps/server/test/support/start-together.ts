import { existsSync, writeFileSync } from 'node:fs'

// Preloaded into a child process (`node --import`) so that several of them can be released at the same moment: each one
// says it has started, then waits, before any of the code under test is loaded, for the gate file to appear. Without it
// the processes would start a few hundred milliseconds apart and a race between them would almost never happen.

const gate = process.env['START_GATE']
if (gate !== undefined) {
  writeFileSync(`${gate}.${process.pid}.ready`, '')
  const pause = new Int32Array(new SharedArrayBuffer(4))
  while (!existsSync(gate)) Atomics.wait(pause, 0, 0, 2)
}
