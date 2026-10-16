import { loadDatabaseUrl } from '../../config.ts'
import { createDatabase } from '../database.ts'
import { seedDemo } from './seed.ts'

// `npm run seed:demo`: fills a migrated development database with the demo workspaces. Never in production: it
// creates people who can be named in the development header, and a database that has them is not one to serve.

if (process.env['NODE_ENV'] === 'production') {
  console.error('The demo seed is for development and the end-to-end tests: it does not run with NODE_ENV=production.')
  process.exit(1)
}

const database = createDatabase(loadDatabaseUrl())
try {
  console.log(
    (await seedDemo(database)) ? 'The demo workspaces are in place.' : 'The demo workspaces were already there.',
  )
} finally {
  await database.destroy()
}
