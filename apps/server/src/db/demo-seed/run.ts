import { isDevelopmentEnvironment, loadDatabaseUrl } from '../../config.ts'
import { createDatabase } from '../database.ts'
import { seedDemo } from './seed.ts'

// `npm run seed:demo`: fills a migrated development database with the demo workspaces. Only with a `NODE_ENV` set to
// development or test, the rule of the development identity: it creates people who can be named in the development
// header, and a database that has them is not one to serve.

if (!isDevelopmentEnvironment(process.env)) {
  console.error('The demo seed runs only with NODE_ENV set to development or test, and it is not.')
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
